import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  LayoutGrid,
  RotateCcw,
  Info,
  X,
  CheckCircle2,
  Database,
  CloudOff
} from 'lucide-react';
import {
  uploadRecordingToGateway,
  streamAudioFromGateway,
  submitSpellingToGateway,
  enqueueForBackgroundUpload,
  dequeueFromBackgroundUpload,
  processBackgroundUploadQueue
} from './services/cloudSyncService';
import {
  isLibraryResetCompleted,
  executeOneTimeLibraryReset,
  reconcileLocalLibraryWithCloud
} from './services/libraryResetService';
import {
  AppSection,
  EdoEntry,
  ScreenNumber,
  TeachStepState
} from './types/edo';
import {
  loadEntries,
  loadLibrary,
  saveEntries,
  saveAudioFileLocally,
  resetToDefaultData,
  saveRecordingInformation,
  computeStudioStats,
  INITIAL_EDO_ENTRIES,
  TEACH_QUESTION_IDS
} from './services/storageService';
import {
  getAllVocabularyPrompts,
  normalizeEnglish,
  fetchMoreOnlineVocabulary
} from './services/vocabularyService';
import { fetchCommunityLibrary, queueCommunityEdit, syncCommunityEdits, ensureCommunityEditSynced, readCommunityCache, mergeCommunityEntries, getHelpOthersEligibleEntries, readSpellingDrafts, queueCommunitySpelling, syncSpellingDrafts, uploadWrittenContribution, CommunitySnapshot } from './services/communityLibrary';
import { invalidateSessionAudio } from './services/audioService';
import { LocalLibrary } from './services/libraryProtection';
import { SCREEN_BADGE_MAP } from './components/ScreenBadgeHeader';
import {
  PhoneFrame,
  DEVICE_VIEWPORTS,
  DeviceViewportSpec
} from './components/PhoneFrame';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { TeachEdoScreen } from './screens/TeachEdoScreen';
import { HelpOthersScreen } from './screens/HelpOthersScreen';
import { LanguageLibraryScreen } from './screens/LanguageLibraryScreen';
import { AiProgressScreen } from './screens/AiProgressScreen';
import { TeachSomethingElseScreen } from './screens/TeachSomethingElseScreen';

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'uid-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
}

export const App: React.FC = () => {
  const [libraryInfo, setLibraryInfo] = useState<LocalLibrary | null>(null);
  const [entries, setEntries] = useState<EdoEntry[]>(INITIAL_EDO_ENTRIES);
  const [activeSection, setActiveSection] = useState<AppSection>('welcome');
  const [teachStepState, setTeachStepState] = useState<TeachStepState>('prompt');
  const [viewMode, setViewMode] = useState<'single' | 'storyboard'>('single');
  const [deviceSpec, setDeviceSpec] = useState<DeviceViewportSpec>(DEVICE_VIEWPORTS[0]);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth <= 640 : false
  );
  // Developer-only preview bar: completely hidden from public users and disabled in production builds
  const [isDevPreviewMode, setIsDevPreviewMode] = useState<boolean>(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSystemModal, setShowSystemModal] = useState(false);

  const [community, setCommunity] = useState<CommunitySnapshot | null>(null);
  const [communityError, setCommunityError] = useState('');
  const [communityBusy, setCommunityBusy] = useState(false);
  const [spellingDrafts, setSpellingDrafts] = useState<Awaited<ReturnType<typeof readSpellingDrafts>>>([]);
  const [pendingHelpOthersIds, setPendingHelpOthersIds] = useState<Set<string>>(() => new Set());
  const communityInFlight = useRef(false);
  const sharedEntries = mergeCommunityEntries(entries, community?.entries || [], spellingDrafts, community?.tombstones || []);
  async function refreshCommunity() {
    if (communityInFlight.current) return;
    communityInFlight.current = true;
    setCommunityBusy(true);
    try {
      const cached = await readCommunityCache();
      if (cached) setCommunity(cached);
      setSpellingDrafts(await readSpellingDrafts());
      if (!navigator.onLine) { setCommunityError('Offline — showing previously cached community contributions. Pending work stays on this device.'); return; }
      let snapshot = await fetchCommunityLibrary();
      setCommunity(snapshot);

      // One-time authoritative reset; private originals and pending work are retained.
      const resetDone = await isLibraryResetCompleted();
      if (!resetDone) {
        await executeOneTimeLibraryReset(snapshot);
      } else {
        await reconcileLocalLibraryWithCloud(snapshot);
      }

      let changedOnline = false;
      let queuedAudio = false;
      const local = await loadLibrary();
      // Only genuine unsynchronized recordings waiting for upload should be enqueued
      for (const entry of local.entries) {
        if (!entry.isSampleData && entry.hasAudio && entry.audioDataUrl && entry.syncStatus !== 'synced_to_drive' && !entry.cloudMetadataFileId) {
          enqueueForBackgroundUpload(entry.id);
          queuedAudio = true;
        }
        const remote = snapshot.entries.find(item => item.recordingId === entry.recordingId || item.cloudMetadataFileId === entry.cloudMetadataFileId);
        if (remote?.cloudMetadataFileId && !remote.edoText && entry.edoText?.trim() && entry.syncStatus !== 'synced_to_drive') { await queueCommunitySpelling(remote.cloudMetadataFileId, entry.edoText); changedOnline = true; }
        if (!entry.isSampleData && !entry.hasAudio && entry.edoText?.trim() && !entry.cloudMetadataFileId) {
          const metadataId = await uploadWrittenContribution(entry);
          changedOnline = true;
          const latest = await loadLibrary();
          await saveEntries(latest.entries.map(item => item.id === entry.id ? { ...item, cloudMetadataFileId: metadataId, syncStatus: 'synced_to_drive' as const } : item), latest.entries);
        }
      }
      if ((await readSpellingDrafts()).some(draft => !draft.error)) changedOnline = true;
      if (queuedAudio) triggerBackgroundWorker();
      await syncSpellingDrafts();
      await syncCommunityEdits();
      changedOnline = true;
      if (changedOnline) snapshot = await fetchCommunityLibrary();
      setCommunity(snapshot);
      setSpellingDrafts(await readSpellingDrafts());
      await refreshLibrary();
      setCommunityError('');
    } catch (error) { setCommunityError(error instanceof Error ? error.message : 'Community Library sync failed. Local recordings are preserved.'); }
    finally { communityInFlight.current = false; setCommunityBusy(false); }
  }
  async function saveSharedSpelling(entryId: string, text: string) {
    const entry = community?.entries.find(item => item.id === entryId);
    if (!entry) throw new Error('Connect to load the current cloud contribution.');
    await queueCommunityEdit(entry, { edoText: text.trim() });
    await refreshCommunity();
    await ensureCommunityEditSynced(entry.cloudMetadataFileId!);
  }
  useEffect(() => {
    if (!isLoaded) return;
    void refreshCommunity();
    const refresh = () => { if (document.visibilityState !== 'hidden') void refreshCommunity(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [isLoaded, activeSection]);

  useEffect(() => {
    loadLibrary().then((loaded) => {
      // Safely migrate only genuine unsynchronized local recordings into the upload queue
      for (const entry of loaded.entries) {
        if (!entry.isSampleData && entry.audioDataUrl && entry.syncStatus !== 'synced_to_drive' && !entry.cloudMetadataFileId) {
          enqueueForBackgroundUpload(entry.id);
        }
      }
      setLibraryInfo(loaded);
      setEntries(loaded.entries);
      setIsLoaded(true);
    }).catch(error => setStorageError(String(error)));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileViewport(window.innerWidth <= 640);
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    // Only allow developer preview parameters when explicitly requested via ?dev=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('dev') === '1') {
      setIsDevPreviewMode(true);
      const screenParam = Number(params.get('screen'));
      if (screenParam >= 1 && screenParam <= 10) {
        handleJumpToScreenNumber(screenParam as ScreenNumber);
      }
      const deviceParam = params.get('device');
      if (deviceParam) {
        const matched = DEVICE_VIEWPORTS.find((d) => d.id === deviceParam);
        if (matched) setDeviceSpec(matched);
      }
    }

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const refreshLibrary = async () => {
    const library = await loadLibrary();
    setLibraryInfo(library);
    setEntries(library.entries);
  };

  const persistUpdatedEntries = async (updated: EdoEntry[]) => {
    try { await saveEntries(updated, entries); }
    catch (error) { await refreshLibrary(); throw error; }
    await refreshLibrary();
  };

  // Continuous background discovery of online English vocabulary
  const [, setOnlineVocabTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const discoverOnlineVocabulary = async () => {
      const allKnown = new Set<string>([
        ...sharedEntries.map((e) => e.english),
        ...(community?.answeredEnglish || []),
        ...getAllVocabularyPrompts().map((e) => e.english)
      ]);

      try {
        const fresh = await fetchMoreOnlineVocabulary(allKnown);
        if (!cancelled && fresh.length > 0) {
          setOnlineVocabTick((v) => v + 1);
        }
      } catch {
        // Silently continue if offline
      }
    };

    if (activeSection === 'teach') {
      const timer = window.setTimeout(discoverOnlineVocabulary, 1200);
      return () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
    }
  }, [activeSection, sharedEntries.length]);

  // The full bank stays stable while recording. Teach Edo filters it against cloud answered history.
  const allPrompts = activeSection === 'teach' ? getAllVocabularyPrompts() : [];
  const fullPromptBank = allPrompts;
  const teachQuestions: EdoEntry[] = allPrompts.map(prompt => {
    const pending = entries.find(entry => entry.id === prompt.id && !entry.isSampleData && entry.audioDataUrl);
    return pending || prompt;
  });

  // Compute current numbered screen badge (used only in optional dev preview mode)
  const getActiveScreenNumber = (): ScreenNumber => {
    switch (activeSection) {
      case 'welcome':
        return 1;
      case 'dashboard':
        return 2;
      case 'teach':
        if (teachStepState === 'prompt') return 3;
        if (teachStepState === 'recorded') return 4;
        if (teachStepState === 'writing') return 5;
        return 6;
      case 'help':
        return 7;
      case 'library':
        return 8;
      case 'progress':
        return 9;
      case 'teach-custom':
        return 10;
    }
  };

  const handleJumpToScreenNumber = (num: ScreenNumber) => {
    setViewMode('single');
    switch (num) {
      case 1:
        setActiveSection('welcome');
        break;
      case 2:
        setActiveSection('dashboard');
        break;
      case 3:
        setActiveSection('teach');
        setTeachStepState('prompt');
        break;
      case 4:
        setActiveSection('teach');
        setTeachStepState('recorded');
        break;
      case 5:
        setActiveSection('teach');
        setTeachStepState('writing');
        break;
      case 6:
        setActiveSection('teach');
        setTeachStepState('completed');
        break;
      case 7:
        setActiveSection('help');
        break;
      case 8:
        setActiveSection('library');
        break;
      case 9:
        setActiveSection('progress');
        break;
      case 10:
        setActiveSection('teach-custom');
        break;
    }
  };

  const entriesRef = useRef<EdoEntry[]>(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const triggerBackgroundWorker = () => {
    window.setTimeout(() => {
      processBackgroundUploadQueue(
        () => entriesRef.current,
        async (entryId, cloudAudioId, cloudMetaId) => {
          // Read current persisted state for each queue item; prior uploads may have changed it.
          const library = await loadLibrary();
          const updated = library.entries.map(item => {
            if (item.id !== entryId) return item;
            return {
              ...item,
              hasAudio: true,
              cloudAudioFileId: cloudAudioId,
              cloudMetadataFileId: cloudMetaId,
              syncStatus: 'synced_to_drive' as const,
              audioDataUrl: undefined, // Safely remove temporary local audio bytes after verified cloud upload
              lastSyncAttempt: new Date().toISOString(),
              syncError: undefined
            };
          });
          await saveEntries(updated, library.entries);
          await refreshLibrary();
          void refreshCommunity();
        },
        async (entryId, errorMsg) => {
          // Failure: KEEP local audio intact, record error
          const library = await loadLibrary();
          const updated = library.entries.map(item => {
            if (item.id !== entryId) return item;
            return {
              ...item,
              syncStatus: 'upload_failed' as const,
              lastSyncAttempt: new Date().toISOString(),
              syncError: errorMsg
            };
          });
          await saveEntries(updated, library.entries);
          await refreshLibrary();
        },
        (entryId, status) => {
          setEntries(prev => prev.map(item => item.id === entryId ? { ...item, syncStatus: status } : item));
        },
        async entry => {
          const library = await loadLibrary();
          const rec = library.recordings.find(recording => recording.id === entry.recordingId || recording.originalLesson.id === entry.id);
          return rec?.permissions || { playback: 'granted', aiVoiceTraining: 'denied', statementVersion: '1' };
        }
      ).catch(err => {
        console.warn('Background upload worker error:', err);
      });
    }, 50);
  };

  useEffect(() => {
    const handleOnline = () => {
      triggerBackgroundWorker();
    };
    window.addEventListener('online', handleOnline);
    if (isLoaded) {
      triggerBackgroundWorker();
    }
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [isLoaded]);

  // Save Voice in Teach Edo (Screen 4 -> Screen 5) — Fast & Non-Blocking
  const handleSaveVoiceContribution = async (
    entryId: string,
    audioDataUrl: string,
    durationSec: number,
    edoText?: string,
    playbackAllowed = true
  ) => {
    const existing = entries.find(item => item.id === entryId);
    if (existing?.audioDataUrl && !existing.isSampleData) throw new Error("This lesson already has a saved recording. Find it in the Language Library.");

    // Look up prompt metadata from fullPromptBank if not already in local entries
    const promptInfo = fullPromptBank.find(p => p.id === entryId) || existing;

    // 1. Immediately save recording to local device storage (<20ms)
    const persistedUri = await saveAudioFileLocally(entryId, audioDataUrl);
    const translation = edoText?.trim() || (!existing?.isSampleData ? existing?.edoText : undefined);
    const hasExistingWriting = Boolean(translation);
    const nowIso = new Date().toISOString();

    const entryToSave: EdoEntry = {
      id: entryId,
      english: promptInfo?.english || existing?.english || 'Lesson',
      category: promptInfo?.category || existing?.category || ('word' as const),
      illustrationKey: promptInfo?.illustrationKey || existing?.illustrationKey || 'chat',
      imageUrl: promptInfo?.imageUrl || existing?.imageUrl,
      emoji: promptInfo?.emoji || existing?.emoji || '🗣️',
      ...(existing || {}),
      hasAudio: true,
      createdAt: existing?.createdAt || nowIso,
      edoText: translation,
      audioDataUrl: persistedUri,
      audioDurationSec: durationSec,
      isSampleData: false,
      status: hasExistingWriting ? ('awaiting_review' as const) : ('needs_writing' as const),
      syncStatus: 'pending_upload',
      updatedAt: nowIso
    };

    // 2. Persist locally: update existing or append newly taught prompt to entries!
    const existingIndex = entries.findIndex((item) => item.id === entryId);
    const updated = existingIndex >= 0
      ? entries.map((item) => (item.id === entryId ? entryToSave : item))
      : [...entries, entryToSave];
    await persistUpdatedEntries(updated);

    const savedLibrary = await loadLibrary();
    const savedRecording = savedLibrary.recordings.find(recording => recording.originalLesson.id === entryId);
    if (savedRecording) await saveRecordingInformation(savedRecording.id, savedRecording.speaker, { ...savedRecording.permissions, playback: playbackAllowed ? 'granted' : 'denied' });

    // 3. Enqueue for background upload and trigger worker asynchronously (NON-BLOCKING)
    enqueueForBackgroundUpload(entryId);
    triggerBackgroundWorker();
  };

  // Retry upload for a locally saved voice recording to Google Drive
  const handleRetryUpload = async (entryId: string) => {
    enqueueForBackgroundUpload(entryId);
    triggerBackgroundWorker();
  };

  // Save Optional Writing in Teach Edo (Screen 5 -> Screen 6)
  const handleSaveWritingForContribution = async (entryId: string, edoText: string) => {
    const existing = entries.find((item) => item.id === entryId);
    const promptInfo = fullPromptBank.find((p) => p.id === entryId) || existing;
    const nowIso = new Date().toISOString();

    const entryToSave: EdoEntry = {
      id: entryId,
      english: promptInfo?.english || existing?.english || 'Lesson',
      category: promptInfo?.category || existing?.category || 'word',
      illustrationKey: promptInfo?.illustrationKey || existing?.illustrationKey || 'chat',
      imageUrl: promptInfo?.imageUrl || existing?.imageUrl,
      emoji: promptInfo?.emoji || existing?.emoji || '🗣️',
      ...(existing || {}),
      hasAudio: existing?.hasAudio ?? true,
      edoText: edoText.trim(),
      isSampleData: false,
      status: 'awaiting_review' as const,
      updatedAt: nowIso,
      notes: 'Voice & Edo writing contributed on this device (awaiting community review)'
    };

    const existingIndex = entries.findIndex((item) => item.id === entryId);
    const updated = existingIndex >= 0
      ? entries.map((item) => (item.id === entryId ? entryToSave : item))
      : [...entries, entryToSave];
    await persistUpdatedEntries(updated);

    // If cloud metadata already exists or is known, attach spelling directly to existing metadata
    const cloudEntry = community?.entries.find(item => item.sourceLessonId === entryId || item.id === entryId);
    const metadataId = existing?.cloudMetadataFileId || cloudEntry?.cloudMetadataFileId;
    if (metadataId) {
      await queueCommunityEdit({ ...entryToSave, cloudMetadataFileId: metadataId, version: cloudEntry?.version || 0 }, { edoText: edoText.trim() });
      void (async () => {
        try {
          await syncCommunityEdits();
          await refreshCommunity();
        } catch (err) {
          console.warn('[TeachEdo] Spelling sync queued:', err);
        }
      })();
    }
  };

  const handleUpdateLibraryEntry = async (entryId: string, updates: { english?: string; edoText?: string; audioDataUrl?: string; durationSec?: number }) => {
    const entry = (community?.entries || []).find(item => item.id === entryId) ||
      entries.find(item => item.id === entryId);
    if (!entry) throw new Error('This cloud contribution is no longer available.');
    await queueCommunityEdit(entry, updates);
    await refreshCommunity();
    void (async () => {
      try {
        await syncCommunityEdits();
        await refreshCommunity();
        await refreshLibrary();
      } catch (err) {
        console.warn('[EditLesson] Background sync retry queued:', err);
      }
    })();
  };

  const handleQueueHelpOthersWriting = async (entryId: string, text: string) => {
    const entry = (community?.entries || []).find(item => item.id === entryId) ||
      entries.find(item => item.id === entryId);
    if (!entry) throw new Error('Connect to load the current cloud contribution.');
    if (entry.cloudMetadataFileId) {
      setPendingHelpOthersIds(prev => new Set(prev).add(entry.cloudMetadataFileId!));
    }
    await queueCommunityEdit(entry, { edoText: text.trim() });
    void (async () => {
      try {
        await syncCommunityEdits();
        await refreshCommunity();
        await refreshLibrary();
      } catch (err) {
        console.warn('[HelpOthers] Background sync retry queued:', err);
      }
    })();
  };

  const handleQueueHelpOthersAudio = async (entryId: string, audioDataUrl: string, durationSec: number) => {
    const entry = (community?.entries || []).find(item => item.id === entryId) ||
      entries.find(item => item.id === entryId);
    if (!entry) throw new Error('This cloud contribution is no longer available.');
    if (entry.cloudMetadataFileId) {
      setPendingHelpOthersIds(prev => new Set(prev).add(entry.cloudMetadataFileId!));
    }
    await queueCommunityEdit(entry, { audioDataUrl, durationSec });
    void (async () => {
      try {
        await syncCommunityEdits();
        await refreshCommunity();
        await refreshLibrary();
      } catch (err) {
        console.warn('[HelpOthers] Background sync retry queued:', err);
      }
    })();
  };

  // Skip Writing in Teach Edo -> Keep Voice as "Needs Writing" (Screen 5 -> Screen 6)
  const handleSkipWritingKeepVoice = async (entryId: string) => {
    const existing = entries.find((item) => item.id === entryId);
    const promptInfo = fullPromptBank.find((p) => p.id === entryId) || existing;
    const nowIso = new Date().toISOString();

    const entryToSave: EdoEntry = {
      id: entryId,
      english: promptInfo?.english || existing?.english || 'Lesson',
      category: promptInfo?.category || existing?.category || 'word',
      illustrationKey: promptInfo?.illustrationKey || existing?.illustrationKey || 'chat',
      imageUrl: promptInfo?.imageUrl || existing?.imageUrl,
      emoji: promptInfo?.emoji || existing?.emoji || '🗣️',
      ...(existing || {}),
      hasAudio: existing?.hasAudio ?? true,
      edoText: undefined,
      isSampleData: false,
      status: 'needs_writing' as const,
      updatedAt: nowIso
    };

    const existingIndex = entries.findIndex((item) => item.id === entryId);
    const updated = existingIndex >= 0
      ? entries.map((item) => (item.id === entryId ? entryToSave : item))
      : [...entries, entryToSave];
    await persistUpdatedEntries(updated);
  };

  // Help Others: Attach writing to an existing voice-recorded contribution (no duplicate record)
  const handleAttachWritingToEntry = async (entryId: string, edoText: string) => {
    const existing = entries.find(item => item.id === entryId);
    const updated = entries.map((item) => {
      if (item.id !== entryId) return item;
      return {
        ...item,
        edoText,
        isSampleData: false,
        status: 'awaiting_review' as const,
        updatedAt: new Date().toISOString(),
        notes: 'Completed via Help Others (writing attached to existing voice recording)'
      };
    });
    await persistUpdatedEntries(updated);

    if (existing?.cloudMetadataFileId) {
      await queueCommunitySpelling(existing.cloudMetadataFileId, edoText);
      void refreshCommunity();
    }

  };

  // Help Others: Attach voice recording to an existing written contribution — Fast & Non-Blocking
  const handleAttachAudioToEntry = async (
    entryId: string,
    audioDataUrl: string,
    durationSec: number,
    playbackAllowed = true
  ) => {
    const persistedUri = await saveAudioFileLocally(entryId, audioDataUrl);
    const existing = entries.find(item => item.id === entryId);
    const nowIso = new Date().toISOString();

    const entryToSave: EdoEntry = {
      ...(existing || { id: entryId, english: '', category: 'word' as const, illustrationKey: 'mic', emoji: '🎙️' }),
      hasAudio: true,
      audioDataUrl: persistedUri,
      createdAt: existing?.createdAt || nowIso,
      audioDurationSec: durationSec,
      isSampleData: false,
      status: 'awaiting_review' as const,
      syncStatus: 'pending_upload',
      updatedAt: nowIso,
      notes: 'Completed via Help Others (pronunciation attached to existing Edo writing)'
    };

    const existingIndex = entries.findIndex((item) => item.id === entryId);
    const updated = existingIndex >= 0
      ? entries.map((item) => (item.id === entryId ? entryToSave : item))
      : [...entries, entryToSave];
    await persistUpdatedEntries(updated);

    const saved = await loadLibrary();
    const recording = saved.recordings.find(item => item.originalLesson.id === entryId || item.id === entryToSave.recordingId);
    if (recording) await saveRecordingInformation(recording.id, recording.speaker, { ...recording.permissions, playback: playbackAllowed !== false ? 'granted' : 'denied', aiVoiceTraining: 'denied', statementVersion: '1' });
    enqueueForBackgroundUpload(entryId);
    triggerBackgroundWorker();
  };

  // Teach Something Else: Save custom word/phrase/sentence
  const handleSaveCustomContribution = async (params: {
    englishText: string;
    edoText: string;
    audioDataUrl?: string;
    audioDurationSec?: number;
    playbackAllowed?: boolean;
  }) => {
    if (entries.some(item => item.english.trim().toLowerCase() === params.englishText.trim().toLowerCase() && !item.isSampleData && (item.audioDataUrl || item.edoText))) {
      throw new Error("This English lesson already exists. Edit it in the Language Library.");
    }
    const newId = `custom-${safeUUID()}`;
    let persistedAudio: string | undefined = undefined;
    if (params.audioDataUrl) {
      persistedAudio = await saveAudioFileLocally(newId, params.audioDataUrl);
    }

    const hasVoice = Boolean(persistedAudio);
    const hasWriting = Boolean(params.edoText.trim());

    const status =
      hasVoice && hasWriting
        ? 'awaiting_review'
        : hasVoice
        ? 'needs_writing'
        : 'needs_audio';

    const wordCount = params.englishText.trim().split(/\s+/).length;
    const category = wordCount <= 2 ? 'word' : wordCount <= 4 ? 'phrase' : 'sentence';

    const newEntry: EdoEntry = {
      id: newId,
      createdAt: new Date().toISOString(),
      english: params.englishText,
      edoText: hasWriting ? params.edoText.trim() : undefined,
      category,
      illustrationKey: 'chat',
      emoji: '🗣️',
      hasAudio: hasVoice,
      audioDataUrl: persistedAudio,
      audioDurationSec: params.audioDurationSec || (hasVoice ? 3 : 0),
      status,
      isSampleData: false,
      updatedAt: new Date().toISOString(),
      notes: 'Contributed via Teach Something Else'
    };

    await persistUpdatedEntries([newEntry, ...entries]);
    if (hasVoice) {
      const saved = await loadLibrary();
      const recording = saved.recordings.find(item => item.originalLesson.id === newId || item.id === newEntry.recordingId);
      if (recording) await saveRecordingInformation(recording.id, recording.speaker, { ...recording.permissions, playback: params.playbackAllowed !== false ? 'granted' : 'denied', aiVoiceTraining: 'denied', statementVersion: '1' });
      enqueueForBackgroundUpload(newId);
      triggerBackgroundWorker();
    } else void refreshCommunity();
  };

  const handleResetData = async () => {
    if (!window.confirm("Reset the visible lesson list? Original recordings remain protected and included in exports.")) return;
    await resetToDefaultData();
    await refreshLibrary();
    setShowSystemModal(false);
  };

  const helpOthersEligible = getHelpOthersEligibleEntries(
    community?.entries || [],
    community?.tombstones || [],
    pendingHelpOthersIds
  );
  const stats = computeStudioStats(sharedEntries, helpOthersEligible.totalCount);
  const currentScreenNumber = getActiveScreenNumber();

  const renderScreenBySection = (
    section: AppSection,
    stepOverride?: TeachStepState
  ) => {
    switch (section) {
      case 'welcome':
        return <WelcomeScreen onGetStarted={() => setActiveSection('dashboard')} />;
      case 'dashboard':
        return (
          <DashboardScreen
            onNavigate={(next) => {
              if (next === 'teach') {
                setTeachStepState('prompt');
              }
              setActiveSection(next);
            }}
            onOpenSystemInfo={() => setShowSystemModal(true)}
            stats={stats}
          />
        );
      case 'teach':
        return (
          <TeachEdoScreen
            questions={teachQuestions}
            cloudAnsweredIds={community?.answeredQuestionIds}
            cloudAnsweredEnglish={community?.answeredEnglish}
            initialStepState={stepOverride ?? teachStepState}
            onStepStateChange={(st) => setTeachStepState(st)}
            onSaveVoiceContribution={handleSaveVoiceContribution}
            onSaveWritingForContribution={handleSaveWritingForContribution}
            onSkipWritingKeepVoice={handleSkipWritingKeepVoice}
            onOpenTeachSomethingElse={() => setActiveSection('teach-custom')}
            onFinishForNow={() => setActiveSection('dashboard')}
          />
        );
      case 'help':
        return (
          <HelpOthersScreen
            entries={community?.entries || []}
            tombstones={community?.tombstones || []}
            communityError={communityError}
            communityCheckedAt={community?.checkedAt}
            onAttachWritingToEntry={handleQueueHelpOthersWriting}
            onAttachAudioToEntry={async (id, audioDataUrl, audioDurationSec) => {
              await handleQueueHelpOthersAudio(id, audioDataUrl, audioDurationSec);
            }}
            onBackToDashboard={() => setActiveSection('dashboard')}
          />
        );
      case 'library':
        return (
          <LanguageLibraryScreen
            entries={community?.entries || []}
            onCommunitySync={async () => { triggerBackgroundWorker(); await refreshCommunity(); }}
            communityBusy={communityBusy}
            communityError={communityError}
            communityCheckedAt={community?.checkedAt}
            pendingSpellingCount={spellingDrafts.length}
            onBackToDashboard={() => setActiveSection('dashboard')}
            recordings={libraryInfo?.recordings || []}
            queueCount={libraryInfo?.syncQueue.length || 0}
            onLibraryChanged={async () => { await refreshLibrary(); void refreshCommunity(); }}
            onEditText={saveSharedSpelling}
            onSaveEntry={handleUpdateLibraryEntry}
            onDeleteLesson={async id => {
              const cloudItem = community?.entries.find(e => e.id === id);
              if (cloudItem?.cloudAudioFileId) {
                invalidateSessionAudio(cloudItem.cloudAudioFileId);
              }
              const prompt = INITIAL_EDO_ENTRIES.find(entry => entry.id === id);
              await persistUpdatedEntries(prompt ? entries.map(entry => entry.id === id ? {
                ...prompt, edoText: undefined, audioDataUrl: undefined, hasAudio: false,
                isSampleData: false, status: 'unanswered', createdAt: undefined
              } : entry) : entries.filter(entry => entry.id !== id));
            }}
            onRetrySync={handleRetryUpload}
            onJumpToHelpOthers={() => setActiveSection('help')}
          />
        );
      case 'progress':
        return (
          <AiProgressScreen
            stats={stats}
            onBackToDashboard={() => setActiveSection('dashboard')}
          />
        );
      case 'teach-custom':
        return (
          <TeachSomethingElseScreen
            onSaveCustomContribution={handleSaveCustomContribution}
            onClose={() => setActiveSection('dashboard')}
          />
        );
    }
  };

  if (!isLoaded) return <div className="p-6" role="status">{storageError || 'Loading your language library…'}</div>;

  // 1. Mobile Presentation (<= 640px):
  // Fills the entire available browser viewport without an extra phone frame or cream margins.
  if (isMobileViewport) {
    return (
      <PhoneFrame
        screenNumber={currentScreenNumber}
        isNativeMobileViewport={true}
      >
        {renderScreenBySection(activeSection)}
      </PhoneFrame>
    );
  }

  // 2. Desktop Web Presentation:
  // Warm cream background across the entire webpage, with Edo Language Studio centered in a mobile-sized container.
  return (
    <div className="min-h-[100dvh] w-full bg-[#EFEAD8] text-[#1C241E] flex flex-col">
      {/* Developer-Only Preview Toolbar (Hidden from public users; disabled in production) */}
      {isDevPreviewMode && (
        <div className="bg-[#1B241E] text-white px-4 py-2 shadow-md sticky top-0 z-30">
          <div className="max-w-[1540px] mx-auto flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold text-[13px] text-[#F4C330]">
              Developer Preview Mode
            </span>

            <div className="flex items-center gap-1 overflow-x-auto max-w-full py-0.5">
              {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as ScreenNumber[]).map((num) => {
                const meta = SCREEN_BADGE_MAP[num];
                const isCurrent = viewMode === 'single' && currentScreenNumber === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleJumpToScreenNumber(num)}
                    style={{
                      backgroundColor: meta.bgColor,
                      color: meta.textColor
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition shrink-0 ${
                      isCurrent ? 'ring-2 ring-white' : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    {meta.shortTitle}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg bg-white/10 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('single')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                    viewMode === 'single' ? 'bg-white text-[#1B241E]' : 'text-white/80'
                  }`}
                >
                  <Smartphone className="w-3 h-3" />
                  <span>Phone</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('storyboard')}
                  className={`px-2 py-0.5 rounded text-[11px] font-semibold flex items-center gap-1 ${
                    viewMode === 'storyboard' ? 'bg-white text-[#1B241E]' : 'text-white/80'
                  }`}
                >
                  <LayoutGrid className="w-3 h-3" />
                  <span>All 10</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Centered Desktop Presentation */}
      {viewMode === 'single' || !isDevPreviewMode ? (
        <main className="flex-1 w-full flex items-center justify-center p-4 sm:p-6">
          <PhoneFrame
            screenNumber={currentScreenNumber}
            showDevBadgeAbove={isDevPreviewMode}
            deviceSpec={deviceSpec}
          >
            {renderScreenBySection(activeSection)}
          </PhoneFrame>
        </main>
      ) : (
        /* Developer-Only 10-Screen Storyboard View */
        <main className="flex-1 max-w-[1680px] mx-auto w-full py-6 px-4 space-y-8">
          <div className="flex flex-wrap items-start justify-center gap-5">
            {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as ScreenNumber[]).map((num) => (
              <PhoneFrame
                key={num}
                screenNumber={num}
                showDevBadgeAbove={true}
                scaleCompact
                onSelectScreen={handleJumpToScreenNumber}
              >
                {num === 1 && renderScreenBySection('welcome')}
                {num === 2 && renderScreenBySection('dashboard')}
                {num === 3 && renderScreenBySection('teach', 'prompt')}
                {num === 4 && renderScreenBySection('teach', 'recorded')}
                {num === 5 && renderScreenBySection('teach', 'writing')}
                {num === 6 && renderScreenBySection('teach', 'completed')}
                {num === 7 && renderScreenBySection('help')}
                {num === 8 && renderScreenBySection('library')}
                {num === 9 && renderScreenBySection('progress')}
                {num === 10 && renderScreenBySection('teach-custom')}
              </PhoneFrame>
            ))}
          </div>
        </main>
      )}

      {/* System Architecture & Prototype Status Modal */}
      {showSystemModal && (
        <div
          onClick={() => setShowSystemModal(false)}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-[#FAF7F0] border border-[#DED5C3] p-6 shadow-2xl text-[#1C241E]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E5DEC9]">
              <div className="flex items-center gap-2.5">
                <img
                  src={`${import.meta.env.BASE_URL}assets/edo-bronze-icon.jpg`}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
                <h2 className="text-[19px] font-bold">
                  Edo Language Studio — Info
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSystemModal(false)}
                className="w-8 h-8 rounded-full bg-[#EFE9DA] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13.5px] leading-relaxed">
              <div className="rounded-2xl bg-white border border-[#E5DEC9] p-3.5">
                <h3 className="font-bold text-[#157A4C] flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Community Language Preservation Prototype</span>
                </h3>
                <p className="text-[#3C473F] text-[12.5px]">
                  Edo Language Studio helps speakers record and write Edo words and phrases. Recordings and text are currently stored locally on your device.
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E5DEC9] p-3.5">
                <h3 className="font-bold text-[#6E4BC3] flex items-center gap-1.5 mb-1">
                  <Database className="w-4 h-4" />
                  <span>Sample &amp; Local Data</span>
                </h3>
                <p className="text-[#3C473F] text-[12.5px]">
                  Initial library words are marked <strong>Sample</strong> until community review is connected. You have added {stats.localContributionsCount} local contributions on this device.
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleResetData}
                className="px-4 py-2.5 rounded-xl bg-white border border-[#D8CFC0] hover:bg-[#F3EDE0] text-[#3A453D] text-[13px] font-bold flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Lesson List</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSystemModal(false)}
                className="px-5 py-2.5 rounded-xl bg-[#157A4C] text-white text-[13.5px] font-bold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
