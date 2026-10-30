import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Volume2,
  X,
  Play,
  Square,
  Mic,
  Lock,
  Pencil,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { getChildrenAudio } from '../services/childrenLibraryService';
import { EdoEntry } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';
import { WordIllustration } from '../components/WordIllustration';
import { EdoLetterBar } from '../components/EdoLetterBar';
import { playAudioRecording, stopActivePlayback, MicrophoneRecorder, invalidateSessionAudio, createPrimedAudioElement, getCachedSessionAudio } from '../services/audioService';
import {
  getCommunityAudio,
  updateOwnedRecordingPermissions,
  readPendingCloudEdits,
  retryPendingCloudEdit,
  CloudEditDraft
} from '../services/communityLibrary';
import { adminLockEntry, adminUnlockEntry, adminDeleteEntry, adminSetApprovalCode, recordPlaybackToGateway } from '../services/cloudSyncService';

export interface LanguageLibraryScreenProps {
  entries: EdoEntry[];
  readOnly?: boolean;
  onCommunitySync?: () => Promise<void>;
  communityBusy?: boolean;
  communityError?: string;
  communityCheckedAt?: string;
  pendingSpellingCount?: number;
  recordings?: any[];
  queueCount?: number;
  pendingEdits?: CloudEditDraft[];
  onLibraryChanged?: () => Promise<void>;
  onEditText?: (id: string, text: string) => Promise<void>;
  onSaveEntry?: (entryId: string, updates: { english?: string; edoText?: string; audioDataUrl?: string; durationSec?: number }) => Promise<void>;
  onDeleteLesson?: (id: string) => Promise<void>;
  onRetrySync?: (id: string) => Promise<void>;
  onBackToDashboard: () => void;
  onJumpToHelpOthers?: () => void;
}

type LibraryFilter = 'all' | 'words' | 'phrases';

/**
 * Requirement: Library must contain only completed, verified lessons:
 * - English word or phrase
 * - Edo translation or spelling
 * - Valid real saved voice recording (local audioDataUrl or cloud audio)
 * - Playback permission granted (never consent-denied or corrupted)
 * - Excludes all synthetic test fixtures and prototype placeholders
 */
export function isCompletedLesson(entry: EdoEntry): boolean {
  if (entry.status === 'unanswered' || entry.status === 'needs_writing' || entry.status === 'needs_audio') {
    return false;
  }
  if (entry.isSampleData) {
    return false;
  }
  // Strictly exclude synthetic test phrases and verification fixtures
  if (
    entry.id.toLowerCase().includes('test-') ||
    (entry.recordingId && entry.recordingId.toLowerCase().includes('test-')) ||
    entry.english.toUpperCase().includes('SYNC VERIFICATION') ||
    entry.english.toUpperCase().includes('SYNC TEST') ||
    (entry.edoText && entry.edoText.toUpperCase().includes('SYNC TEST'))
  ) {
    return false;
  }
  const hasEnglish = Boolean(entry.english && entry.english.trim());
  const hasEdo = Boolean(entry.edoText && entry.edoText.trim());

  // Google Drive is the authoritative source: Entry must be confirmed by the gateway
  // An unsynchronized local recording or old local cache without active cloud files cannot appear in public Library
  const isConfirmedCloud = Boolean(
    entry.cloudMetadataFileId &&
    entry.cloudAudioFileId &&
    entry.hasAudio &&
    entry.isCommunity === true
  );

  return Boolean(hasEnglish && hasEdo && isConfirmedCloud);
}

export const LanguageLibraryScreen: React.FC<LanguageLibraryScreenProps> = ({
  entries,
  readOnly = false,
  communityError, communityCheckedAt, communityBusy,
  pendingEdits: propPendingEdits,
  onLibraryChanged,
  onEditText,
  onSaveEntry,
  onBackToDashboard
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedEntry] = useState<EdoEntry | null>(null);
  const selectedEntry = selectedSnapshot ? entries.find(entry => entry.id === selectedSnapshot.id) || null : null;

  // Background cloud saving state per lesson card
  const [pendingEdits, setPendingEdits] = useState<CloudEditDraft[]>([]);
  const effectivePendingEdits = propPendingEdits !== undefined ? propPendingEdits : pendingEdits;

  const pendingEditsMap = new Map<string, CloudEditDraft>();
  for (const draft of effectivePendingEdits) {
    if (draft.metadataFileId) {
      pendingEditsMap.set(draft.metadataFileId, draft);
    }
  }

  // Edit modal state
  const [editEnglish, setEditEnglish] = useState('');
  const [editEdoText, setEditEdoText] = useState('');
  const editEdoInputRef = useRef<HTMLInputElement | null>(null);
  const [newAudioDataUrl, setNewAudioDataUrl] = useState<string | null>(null);
  const [newAudioDuration, setNewAudioDuration] = useState<number>(0);
  const [isRecordingNewVoice, setIsRecordingNewVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [permissionRenewBusy, setPermissionRenewBusy] = useState(false);
  const [transientFeedback, setTransientFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  // Admin lock, unlock, delete, and 6-digit approval code state
  const [showAdminUnlock, setShowAdminUnlock] = useState(false);
  const [showAdminLock, setShowAdminLock] = useState(false);
  const [adminMode, setAdminMode] = useState<'code' | 'owner'>('code');
  const [approvalCodeInput, setApprovalCodeInput] = useState('');
  const [newApprovalCodeInput, setNewApprovalCodeInput] = useState('');
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [adminUnlockBusy, setAdminUnlockBusy] = useState(false);
  const [adminUnlockError, setAdminUnlockError] = useState<string | null>(null);
  const [adminLockBusy, setAdminLockBusy] = useState(false);
  const [adminLockError, setAdminLockError] = useState<string | null>(null);
  const [adminDeleteBusy, setAdminDeleteBusy] = useState(false);
  const [adminDeleteError, setAdminDeleteError] = useState<string | null>(null);
  const [setCodeBusy, setSetCodeBusy] = useState(false);
  const [setCodeError, setSetCodeError] = useState<string | null>(null);
  const [setCodeSuccess, setSetCodeSuccess] = useState<string | null>(null);

  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const childPlaybackRef = useRef({ request: 0, entryId: null as string | null });
  const SpeakerControl = readOnly ? 'span' : 'button';

  useEffect(() => {
    return () => {
      childPlaybackRef.current.request++;
      childPlaybackRef.current.entryId = null;
      stopActivePlayback();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      if (recorderRef.current) recorderRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (transientFeedback) {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => {
        setTransientFeedback(null);
        feedbackTimerRef.current = null;
      }, 4000);
    }
  }, [transientFeedback]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [searchQuery, activeFilter]);

  useEffect(() => {
    let isMounted = true;
    const loadEdits = async () => {
      try {
        const edits = await readPendingCloudEdits();
        if (isMounted) setPendingEdits(edits);
      } catch {
        // Ignore
      }
    };
    void loadEdits();
    const handleEditsChanged = () => { void loadEdits(); };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('edo_pending_edits_changed', handleEditsChanged);
    }
    return () => {
      isMounted = false;
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('edo_pending_edits_changed', handleEditsChanged);
      }
    };
  }, []);

  useEffect(() => {
    if (propPendingEdits) {
      setPendingEdits(propPendingEdits);
    }
  }, [propPendingEdits]);

  // When opening an entry, initialize edit fields
  const handleOpenEntry = (entry: EdoEntry) => {
    if (readOnly) return;
    stopActivePlayback();
    setSelectedEntry(entry);
    setEditEnglish(entry.english);
    setEditEdoText(entry.edoText || '');
    setNewAudioDataUrl(null);
    setNewAudioDuration(0);
    setIsRecordingNewVoice(false);
    setRecordingSeconds(0);
    setModalError(null);
    setModalSuccess(null);
    setShowAdminUnlock(false);
    setShowAdminLock(false);
    setAdminMode('code');
    setApprovalCodeInput('');
    setNewApprovalCodeInput('');
    setAdminTokenInput('');
    setAdminUnlockError(null);
    setAdminLockError(null);
    setAdminDeleteError(null);
    setSetCodeError(null);
    setSetCodeSuccess(null);
  };

  const handleCloseModal = () => {
    stopActivePlayback();
    if (isRecordingNewVoice && recorderRef.current) {
      recorderRef.current.cancel();
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
    setSelectedEntry(null);
  };

  // Requirement 3: Only completed lessons appear in learning Library
  const completedEntries = entries.filter(entry => isCompletedLesson(entry) && (!readOnly || entry.playbackPermission === 'granted'));

  const visibleEntries = completedEntries.filter((entry) => {
    if (activeFilter === 'words' && entry.category !== 'word') return false;
    if (activeFilter === 'phrases' && entry.category !== 'phrase' && entry.category !== 'sentence') {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchEng = entry.english.toLowerCase().includes(q);
      const matchEdo = (entry.edoText || '').toLowerCase().includes(q);
      return matchEng || matchEdo;
    }
    return true;
  });

  const handleRenewPermission = async () => {
    if (!selectedEntry || !selectedEntry.cloudMetadataFileId) return;
    setPermissionRenewBusy(true);
    setModalError(null);
    setModalSuccess(null);
    try {
      await updateOwnedRecordingPermissions(
        selectedEntry.recordingId || selectedEntry.id,
        selectedEntry.cloudMetadataFileId,
        { playback: 'granted', aiVoiceTraining: 'denied' }
      );
      setSelectedEntry(prev => prev ? { ...prev, playbackPermission: 'granted' } : null);
      setModalSuccess('Library playback permission granted! Other users can now listen to this recording.');
      if (onLibraryChanged) await onLibraryChanged();
    } catch (err: any) {
      setModalError(err?.message || 'Unable to update permission. You can record a replacement voice below.');
    } finally {
      setPermissionRenewBusy(false);
    }
  };

  // Requirement 5: Speaker button strictly plays the Edo voice recording
  const handlePlayWordAudio = async (e: React.SyntheticEvent, entry: EdoEntry) => {
    e.stopPropagation();
    if (!entry.hasAudio) return;

    if (entry.playbackPermission === 'denied') {
      alert(`The contributor has not yet granted shared playback permission for "${entry.english}". You can tap the pencil icon to grant permission or record a replacement voice.`);
      return;
    }

    const playback = childPlaybackRef.current;
    const request = ++playback.request;

    // Tapping on the currently playing or loading entry stops/cancels playback
    if (playback.entryId === entry.id) {
      playback.entryId = null;
      stopActivePlayback();
      setPlayingId(null);
      setLoadingAudioId(null);
      return;
    }

    // Stop active playback and register new active request
    stopActivePlayback();
    playback.entryId = entry.id;
    setPlayingId(null);

    const finish = () => {
      if (playback.request === request) {
        playback.entryId = null;
        setPlayingId(null);
        setLoadingAudioId(null);
      }
    };

    // Synchronously prime an HTMLAudioElement inside the user tap event for Mobile Safari
    const primedAudio = createPrimedAudioElement();

    // Fast-path: Check if audio is already available in memory cache or local entry
    const isDirectLocal = !entry.isCommunity && entry.audioDataUrl && entry.audioDataUrl.startsWith('data:audio/');
    const cachedMemory = entry.cloudAudioFileId ? getCachedSessionAudio(entry.cloudAudioFileId) : null;
    const immediateAudio = isDirectLocal ? entry.audioDataUrl : cachedMemory;

    if (immediateAudio) {
      setLoadingAudioId(null);
      setPlayingId(entry.id);
      playAudioRecording(
        immediateAudio,
        entry.audioDurationSec || 3,
        (_sec, playing) => {
          if (!playing) finish();
          else if (playback.request === request) setPlayingId(entry.id);
        },
        {
          allowDemoFallback: false,
          primedAudio,
          onError: finish
        }
      );
      if (!readOnly && entry.cloudMetadataFileId) {
        void recordPlaybackToGateway(entry.cloudMetadataFileId).catch(() => {});
      }
      return;
    }

    // Audio must be downloaded: immediately provide visual Loading feedback on the first tap!
    setLoadingAudioId(entry.id);

    try {
      const audioUrl = readOnly ? await getChildrenAudio(entry) : await getCommunityAudio(entry);
      // If user tapped Stop, tapped another card, or unmounted while fetching, abort cleanly
      if (playback.request !== request) {
        if (primedAudio) {
          try { primedAudio.pause(); } catch (_) {}
        }
        return;
      }
      if (!audioUrl) {
        finish();
        return;
      }

      setLoadingAudioId(null);
      setPlayingId(entry.id);

      playAudioRecording(
        audioUrl,
        entry.audioDurationSec || 3,
        (_sec, playing) => {
          if (!playing) finish();
          else if (playback.request === request) setPlayingId(entry.id);
        },
        {
          allowDemoFallback: false,
          primedAudio,
          onError: finish
        }
      );

      if (!readOnly && entry.cloudMetadataFileId) {
        void recordPlaybackToGateway(entry.cloudMetadataFileId).catch(() => {});
      }
    } catch (err) {
      if (playback.request === request) {
        finish();
      }
    }
  };

  // Play audio in modal
  const handlePlayModalAudio = (audioUrl?: string, duration = 3) => {
    if (!audioUrl) return;
    if (playingId === 'modal') {
      stopActivePlayback();
      setPlayingId(null);
      return;
    }
    setPlayingId('modal');
    playAudioRecording(
      audioUrl,
      duration,
      (_sec, playing) => {
        if (!playing) setPlayingId(null);
      },
      {
        allowDemoFallback: false,
        onError: () => setPlayingId(null)
      }
    );
  };

  // Start recording replacement voice
  const handleStartRecording = async () => {
    stopActivePlayback();
    setModalError(null);
    setNewAudioDataUrl(null);
    setNewAudioDuration(0);

    const recorder = new MicrophoneRecorder();
    recorderRef.current = recorder;
    const startResult = await recorder.start();
    if (!startResult.ok) {
      setModalError(startResult.errorMessage || 'Unable to access microphone.');
      return;
    }

    setIsRecordingNewVoice(true);
    setRecordingSeconds(0);
    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 200);
  };

  // Stop recording replacement voice — auto-plays once immediately
  const handleStopRecording = async () => {
    if (!recorderRef.current || !isRecordingNewVoice) return;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecordingNewVoice(false);

    const stopResult = await recorderRef.current.stop();
    if (!stopResult.ok) {
      setModalError(stopResult.errorMessage || 'Recording failed. Please try again.');
      return;
    }

    setNewAudioDataUrl(stopResult.audioDataUrl);
    setNewAudioDuration(stopResult.durationSec);

    // Auto-play newly recorded voice once on stop (requirement from user)
    const sourceToPlay = stopResult.objectUrl || stopResult.audioDataUrl;
    if (sourceToPlay) {
      setPlayingId('modal-auto');
      playAudioRecording(
        sourceToPlay,
        stopResult.durationSec,
        (_sec, playing) => {
          if (!playing) setPlayingId(null);
        },
        {
          allowDemoFallback: false,
          onError: () => setPlayingId(null)
        }
      );
    }
  };

  // Save changes from single edit modal: immediately acknowledge, close modal, and save in background
  const handleSaveChanges = async () => {
    if (!selectedEntry) return;
    setModalError(null);
    setModalSuccess(null);

    const eng = editEnglish.trim();
    const edo = editEdoText.trim();
    if (!eng) {
      setModalError('Please enter an English word or phrase.');
      return;
    }
    if (!edo) {
      setModalError('Please enter the Edo translation.');
      return;
    }

    const targetId = selectedEntry.id;
    const metaId = selectedEntry.cloudMetadataFileId;
    const audioDataUrl = newAudioDataUrl || undefined;
    const durationSec = newAudioDuration || undefined;

    // Immediately close modal & show friendly acknowledgment
    handleCloseModal();
    setTransientFeedback(`Thank you! Your changes for "${eng}" were saved locally and are uploading in the background.`);

    // Immediately reflect pending state on this specific card
    if (metaId) {
      setPendingEdits(prev => [
        ...prev.filter(item => item.metadataFileId !== metaId),
        {
          id: 'edit-optimistic-' + Date.now(),
          metadataFileId: metaId,
          expectedVersion: selectedEntry.version || 0,
          updates: { english: eng, edoText: edo, audioDataUrl, durationSec }
        }
      ]);
    }

    if (onSaveEntry) {
      try {
        await onSaveEntry(targetId, {
          english: eng,
          edoText: edo,
          audioDataUrl,
          durationSec
        });
      } catch (err: any) {
        console.warn('[EditLesson] Background save queued:', err);
      }
    } else if (onEditText) {
      try {
        await onEditText(targetId, edo);
      } catch (err: any) {
        console.warn('[EditLesson] Background edit queued:', err);
      }
    }
  };

  const handleRetryPendingEdit = async (e: React.SyntheticEvent, metadataFileId: string) => {
    e.stopPropagation();
    // Immediately clear error & failed flag to show "Saving..." spinner
    setPendingEdits(prev =>
      prev.map(item =>
        item.metadataFileId === metadataFileId
          ? { ...item, error: undefined, lastAttemptFailed: false, lastErrorMessage: undefined }
          : item
      )
    );
    try {
      await retryPendingCloudEdit(metadataFileId);
      if (onLibraryChanged) await onLibraryChanged();
    } catch (err: any) {
      console.warn('[LanguageLibrary] Retry edit error:', err);
      const current = await readPendingCloudEdits();
      setPendingEdits(current);
    }
  };

  // Trusted 6-digit approval code submission (Approve & Lock only)
  const handleApproveWithCode = async () => {
    if (!selectedEntry || !selectedEntry.cloudMetadataFileId) return;
    const code = approvalCodeInput.trim();
    if (!/^\d{6}$/.test(code)) {
      setAdminLockError('Please enter the 6-digit approval number.');
      return;
    }

    setAdminLockBusy(true);
    setAdminLockError(null);
    try {
      const res = await adminLockEntry(selectedEntry.cloudMetadataFileId, code);
      if (res.ok) {
        if (onLibraryChanged) await onLibraryChanged();
        handleCloseModal();
      } else {
        setAdminLockError(res.message || 'Invalid 6-digit approval number.');
      }
    } catch (err: any) {
      setAdminLockError(String(err?.message || err));
    } finally {
      setAdminLockBusy(false);
    }
  };

  // Owner sets or updates the 6-digit approval number
  const handleSetApprovalCode = async () => {
    const token = adminTokenInput.trim();
    const newCode = newApprovalCodeInput.trim();
    setSetCodeError(null);
    setSetCodeSuccess(null);
    if (!token) {
      setSetCodeError('Enter owner admin token first.');
      return;
    }
    if (!/^\d{6}$/.test(newCode)) {
      setSetCodeError('Approval number must be 6 digits.');
      return;
    }

    setSetCodeBusy(true);
    try {
      const res = await adminSetApprovalCode(token, newCode);
      if (res.ok) {
        setSetCodeSuccess('6-digit approval number saved.');
        setNewApprovalCodeInput('');
      } else {
        setSetCodeError(res.message || 'Failed to save 6-digit number.');
      }
    } catch (err: any) {
      setSetCodeError(String(err?.message || err));
    } finally {
      setSetCodeBusy(false);
    }
  };

  // Admin unlock submission
  const handleAdminUnlock = async () => {
    if (!selectedEntry || !selectedEntry.cloudMetadataFileId) return;
    const token = adminTokenInput.trim();
    if (!token) {
      setAdminUnlockError('Please enter your administrator credential.');
      return;
    }

    setAdminUnlockBusy(true);
    setAdminUnlockError(null);
    try {
      const res = await adminUnlockEntry(selectedEntry.cloudMetadataFileId, token);
      if (res.ok) {
        if (onLibraryChanged) await onLibraryChanged();
        handleCloseModal();
      } else {
        setAdminUnlockError(res.message || 'Unlock failed. Invalid admin token.');
      }
    } catch (err: any) {
      setAdminUnlockError(String(err?.message || err));
    } finally {
      setAdminUnlockBusy(false);
    }
  };

  // Admin lock submission (Approve & Protect)
  const handleAdminLock = async () => {
    if (!selectedEntry || !selectedEntry.cloudMetadataFileId) return;
    const token = adminTokenInput.trim();
    if (!token) {
      setAdminLockError('Please enter your administrator credential.');
      return;
    }

    setAdminLockBusy(true);
    setAdminLockError(null);
    try {
      const res = await adminLockEntry(selectedEntry.cloudMetadataFileId, token);
      if (res.ok) {
        if (onLibraryChanged) await onLibraryChanged();
        handleCloseModal();
      } else {
        setAdminLockError(res.message || 'Approval failed. Invalid admin token.');
      }
    } catch (err: any) {
      setAdminLockError(String(err?.message || err));
    } finally {
      setAdminLockBusy(false);
    }
  };

  // Admin delete submission (Permanently remove from Google Drive)
  const handleAdminDelete = async () => {
    if (!selectedEntry || !selectedEntry.cloudMetadataFileId) return;
    const token = adminTokenInput.trim();
    if (!token) {
      setAdminDeleteError('Please enter your administrator credential.');
      return;
    }
    const confirmed = typeof window !== 'undefined'
      ? window.confirm(`Permanently delete "${selectedEntry.english}" from Google Drive? This action cannot be undone.`)
      : true;
    if (!confirmed) return;

    setAdminDeleteBusy(true);
    setAdminDeleteError(null);
    try {
      const res = await adminDeleteEntry(selectedEntry.cloudMetadataFileId, token);
      if (res.ok) {
        if (selectedEntry.cloudAudioFileId) {
          invalidateSessionAudio(selectedEntry.cloudAudioFileId);
        }
        if (onLibraryChanged) await onLibraryChanged();
        handleCloseModal();
      } else {
        setAdminDeleteError(res.message || 'Deletion failed. Invalid admin token.');
      }
    } catch (err: any) {
      setAdminDeleteError(String(err?.message || err));
    } finally {
      setAdminDeleteBusy(false);
    }
  };

  return (
    <div className="edo-screen relative">
      {/* Studio Header (Yellow Section) */}
      <StudioHeader
        theme="yellow"
        sectionLabel="Language Library"
        rightAction={readOnly ? 'none' : 'close'}
        onRightAction={readOnly ? undefined : onBackToDashboard}
        onLogoClick={readOnly ? undefined : onBackToDashboard}
      />

      {/* Subtitle / Counter */}
      <p className="px-5 pt-1 pb-1 text-xs text-[#556058] font-medium" role="status">
        {completedEntries.length} completed {completedEntries.length === 1 ? 'lesson' : 'lessons'} in Library
      </p>

      {communityError && <p role="status" className="mx-5 text-xs text-[#56625A]">{communityCheckedAt ? 'Showing previously received lessons. Reconnecting when the internet is available.' : 'Connect to the internet to load the community Library.'}</p>}
      {/* Search Bar & Filter Pills (px-5) */}
      <div className="w-full px-5 pt-1 pb-2 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#7C857E] absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search words or phrases..."
            className="w-full min-h-[44px] pl-10 pr-9 py-2 rounded-2xl bg-white border border-[#DED6C4] text-[15px] text-[#1C241E] placeholder-[#89918B] focus:outline-none focus:border-[#D4A318] shadow-xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 text-[#7C857E] hover:text-[#1C241E]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills: All / Words / Phrases */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-0.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'words', label: 'Words' },
              { id: 'phrases', label: 'Phrases' }
            ] as { id: LibraryFilter; label: string }[]
          ).map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3.5 py-1 rounded-full text-[13px] font-bold transition shrink-0 ${
                  isActive
                    ? 'bg-[#157A4C] text-white shadow-xs'
                    : 'bg-white border border-[#DFD7C5] text-[#333F36] hover:bg-[#F3EDE0]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Transient save feedback notification */}
      {transientFeedback && (
        <div
          role="status"
          className="mx-5 mb-2.5 px-3.5 py-2.5 rounded-2xl bg-[#E6F4ED] border border-[#BDE3CF] text-[#157A4C] text-[13px] font-semibold flex items-center gap-2 shadow-xs shrink-0"
        >
          <CheckCircle className="w-4 h-4 shrink-0 text-[#157A4C]" />
          <span className="flex-1 leading-snug">{transientFeedback}</span>
        </div>
      )}

      {/* Word Cards List — Requirement 4: Small, Compact 2-Line Cards */}
      <div ref={listRef} className="w-full px-5 pb-5 flex-1 overflow-y-auto space-y-2 min-h-0">
        {visibleEntries.map((entry) => {
          const isPlayingThis = playingId === entry.id;
          const isLoadingThis = loadingAudioId === entry.id;
          const isLocked = entry.reviewStatus === 'approved_locked';
          const isPlaybackDenied = entry.playbackPermission === 'denied';
          const isVerifiedCloud = Boolean(
            entry.cloudMetadataFileId &&
            entry.cloudAudioFileId &&
            !isPlaybackDenied &&
            (entry.syncStatus === 'synced_to_drive' || entry.isCommunity)
          );

          // Pending cloud edit state for this specific card
          const pendingEdit = entry.cloudMetadataFileId ? pendingEditsMap.get(entry.cloudMetadataFileId) : undefined;
          const isPendingSync = Boolean(pendingEdit);
          const isSyncFailed = Boolean(pendingEdit?.error || pendingEdit?.lastAttemptFailed);
          const isSaving = isPendingSync && !isSyncFailed;

          const displayEnglish = pendingEdit?.updates.english || entry.english;
          const displayEdo = pendingEdit?.updates.edoText || entry.edoText;

          return (
            <div
              key={entry.id}
              role={readOnly ? 'button' : undefined}
              tabIndex={readOnly ? 0 : undefined}
              aria-label={readOnly ? `${isPlayingThis ? 'Stop' : 'Play'} recorded Edo pronunciation for ${displayEnglish}` : undefined}
              aria-pressed={readOnly ? isPlayingThis : undefined}
              onClick={(event) => {
                if (isSaving) return;
                if (readOnly) void handlePlayWordAudio(event, entry);
                else if (!isLocked) handleOpenEntry(entry);
              }}
              onKeyDown={readOnly ? (event) => {
                if (isSaving || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                event.preventDefault();
                if (!event.repeat) void handlePlayWordAudio(event, entry);
              } : undefined}
              className={`w-full h-[96px] rounded-2xl border px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-xs transition ${
                isSaving
                  ? 'bg-[#F9FAFB] border-[#E5E7EB] opacity-60 cursor-not-allowed select-none'
                  : isSyncFailed
                  ? 'bg-[#FFF8F8] border-[#FCA5A5]'
                  : 'bg-white hover:bg-[#FCF9F2] border-[#E6DFCF]'
              }`}
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
                  <WordIllustration
                    id={entry.sourceLessonId || entry.id}
                    english={displayEnglish}
                    illustrationKey={entry.illustrationKey}
                    imageUrl={entry.imageUrl}
                    skipLocalCache={readOnly}
                    size="sm"
                  />
                </div>

                <div className="min-w-0 flex-1 max-h-[74px] overflow-y-auto pr-1">
                  {/* Line 1: English (Full text visible, wraps cleanly) */}
                  <p className="text-[13px] leading-snug font-semibold text-[#1A241D] break-words whitespace-normal select-text">
                    <span className="text-[#68766E] font-medium text-[13px]">English:</span> {displayEnglish}
                  </p>

                  {/* Line 2: Edo (Full spelling visible, with small status dot, saving spinner, or lock) */}
                  <p className="text-[13px] leading-snug text-[#157A4C] break-words whitespace-normal mt-0.5 flex items-center gap-1.5 flex-wrap select-text">
                    <span className="text-[#68766E] font-medium text-[13px]">Edo:</span>
                    <span className="font-bold text-[#1F2922]">{displayEdo}</span>
                    {isSaving ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#E6EFFC] text-[#1D6CE0]">
                        <Loader2 className="w-3 h-3 animate-spin shrink-0 text-[#1D6CE0]" />
                        Saving…
                      </span>
                    ) : isSyncFailed ? (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#FDF2F0] text-[#C93B2B]"
                        title={pendingEdit?.error || pendingEdit?.lastErrorMessage || 'Failed to sync with Google Drive'}
                      >
                        Failed to sync
                      </span>
                    ) : isLocked ? (
                      <span title="Approved & Protected" className="inline-flex items-center">
                        <Lock className="w-3.5 h-3.5 text-[#157A4C] shrink-0" />
                      </span>
                    ) : isPlaybackDenied ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-[#EAB308] shrink-0" title="Playback permission restricted (Tap pencil to renew or replace voice)" />
                    ) : isVerifiedCloud ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-[#16A34A] shrink-0" title="Verified online with cloud recording" />
                    ) : null}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Speaker (Listen) and Pencil (Edit) / Retry */}
              <div className="flex items-center gap-2 shrink-0">
                {isSyncFailed && entry.cloudMetadataFileId && (
                  <button
                    type="button"
                    onClick={(e) => handleRetryPendingEdit(e, entry.cloudMetadataFileId!)}
                    aria-label={`Retry syncing ${displayEnglish}`}
                    title="Retry syncing this lesson to Google Drive"
                    className="px-2.5 py-1 rounded-lg bg-[#FDF2F0] hover:bg-[#FCE8E6] border border-[#FCA5A5] text-[#C93B2B] text-[12px] font-bold transition flex items-center gap-1 active:scale-95 shadow-xs"
                  >
                    <RotateCcw className="w-3 h-3 shrink-0" />
                    Retry
                  </button>
                )}

                {/* Speaker Button — Strictly plays recorded Edo human voice */}
                <SpeakerControl
                  type={readOnly || isSaving ? undefined : 'button'}
                  disabled={isSaving}
                  onClick={(e) => {
                    if (isSaving) return;
                    handlePlayWordAudio(e, entry);
                  }}
                  aria-label={readOnly ? undefined : `${isPlayingThis ? 'Stop' : 'Play'} recorded Edo pronunciation for ${displayEnglish}`}
                  title={isSaving ? 'Saving recording to Google Drive…' : isPlaybackDenied ? 'Playback restricted (tap pencil to renew or replace voice)' : undefined}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition shrink-0 ${
                    isSaving
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                      : isLoadingThis
                      ? 'bg-[#E5F4EC] text-[#157A4C] border border-[#A7D7BC]'
                      : isPlayingThis
                      ? 'bg-[#157A4C] text-white scale-105 shadow-xs'
                      : isPlaybackDenied
                      ? 'bg-[#FEF3C7] hover:bg-[#FDE68A] text-[#B45309]'
                      : 'bg-[#E5F4EC] hover:bg-[#D2ECDF] text-[#157A4C]'
                  }`}
                >
                  {isLoadingThis ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#157A4C]" />
                  ) : (
                    <Volume2 className="w-4 h-4 stroke-[2.3]" />
                  )}
                </SpeakerControl>

                {/* Edit Button (Pencil) — ONLY this opens the editing window */}
                {!readOnly && (!isLocked ? (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSaving) return;
                      handleOpenEntry(entry);
                    }}
                    aria-label={`Edit ${displayEnglish}`}
                    title={isSaving ? 'Cannot edit while saving to Google Drive' : 'Edit lesson'}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
                      isSaving
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-40'
                        : 'bg-[#F4EFE2] hover:bg-[#EAE0CE] text-[#556058] hover:text-[#18241B]'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isSaving) return;
                      handleOpenEntry(entry);
                    }}
                    aria-label={`Protected lesson: ${displayEnglish}`}
                    title={isSaving ? 'Cannot edit while saving to Google Drive' : 'Protected lesson (Administrator options)'}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition shrink-0 ${
                      isSaving
                        ? 'bg-gray-100 text-gray-300 cursor-not-allowed opacity-40'
                        : 'bg-[#EBF7EE] text-[#157A4C] opacity-80 hover:opacity-100'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
          );
        })}

        {visibleEntries.length === 0 && (
          <div className="py-10 text-center text-[#5A655D] text-[14px]">
            {communityBusy && !communityCheckedAt ? 'Loading community lessons…' : communityError && !communityCheckedAt ? 'Connect to load the community Library.' : searchQuery ? `No completed lessons match “${searchQuery}”.` : 'No completed cloud lessons yet.'}
          </div>
        )}
      </div>

      {/* Simplified Single-Screen Mobile Details / Edit Modal */}
      {!readOnly && selectedEntry && (
        <div
          onClick={handleCloseModal}
          className="absolute inset-0 bg-black/40 z-20 flex items-center justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-3xl bg-[#FAF7F0] border border-[#E0D8C6] px-5 py-4 shadow-xl flex flex-col gap-2.5"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#E6DFCF]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                  <WordIllustration
                    id={selectedEntry.sourceLessonId || selectedEntry.id}
                    english={selectedEntry.english}
                    illustrationKey={selectedEntry.illustrationKey}
                    imageUrl={selectedEntry.imageUrl}
                    size="sm"
                  />
                </div>
                <h3 className="text-[17px] font-bold text-[#18241B] leading-tight truncate">
                  {selectedEntry.reviewStatus === 'approved_locked' ? 'Protected Lesson' : 'Edit Lesson'}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-full bg-[#EFE9DA] flex items-center justify-center text-[#3A453D] hover:bg-[#E2DAC7] shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Case A: Approved & Locked (Read-Only) */}
            {selectedEntry.reviewStatus === 'approved_locked' ? (
              <div className="space-y-2.5">
                <div className="p-2.5 bg-[#EBF7EE] border border-[#BDE5C8] rounded-2xl flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-[#157A4C] shrink-0" />
                  <p className="text-xs text-[#126941] font-semibold leading-snug">
                    This lesson has been approved and locked. It is protected and cannot be edited by ordinary users.
                  </p>
                </div>

                <div className="bg-white border border-[#E6DFCF] rounded-2xl p-3 space-y-1.5">
                  <div>
                    <span className="text-xs font-semibold text-[#68766E]">English</span>
                    <p className="text-[15px] font-bold text-[#1A241D]">{selectedEntry.english}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[#68766E]">Edo Spelling</span>
                    <p className="text-[15px] font-bold text-[#157A4C]">{selectedEntry.edoText}</p>
                  </div>
                </div>

                {/* Speaker playback */}
                <button
                  type="button"
                  onClick={(e) => handlePlayWordAudio(e, selectedEntry)}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#157A4C] hover:bg-[#126941] text-white font-bold text-sm flex items-center justify-center gap-2 transition shadow-xs"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{playingId === selectedEntry.id ? 'Stop Recorded Edo Voice' : 'Play Recorded Edo Voice'}</span>
                </button>

                {/* Administrator Unlock & Owner Options */}
                <div className="pt-2 border-t border-[#E6DFCF]">
                  <button
                    type="button"
                    onClick={() => setShowAdminUnlock(!showAdminUnlock)}
                    className="w-full py-0.5 text-xs font-semibold text-[#556058] flex items-center justify-between hover:text-[#1A241D]"
                  >
                    <span>Administrator options</span>
                    {showAdminUnlock ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showAdminUnlock && (
                    <div className="mt-2 p-2.5 bg-white border border-[#E6DFCF] rounded-xl space-y-2">
                      <label htmlFor="admin-unlock-token" className="block text-[11px] font-bold text-[#1A241D]">
                        Owner Administrator Token
                      </label>
                      <input
                        id="admin-unlock-token"
                        type="password"
                        value={adminTokenInput}
                        onChange={(e) => setAdminTokenInput(e.target.value)}
                        placeholder="Enter owner admin token"
                        className="w-full py-1.5 px-3 rounded-xl border border-[#DED6C4] text-xs focus:outline-none focus:border-[#157A4C]"
                      />
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={newApprovalCodeInput}
                          onChange={(e) => setNewApprovalCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="Set 6-digit approval code"
                          className="flex-1 py-1.5 px-2.5 rounded-xl border border-[#DED6C4] text-xs tracking-widest font-mono focus:outline-none focus:border-[#157A4C]"
                        />
                        <button
                          type="button"
                          disabled={setCodeBusy}
                          onClick={handleSetApprovalCode}
                          className="py-1.5 px-3 rounded-xl bg-[#3A453D] hover:bg-[#1C241E] text-white font-bold text-xs shrink-0 disabled:opacity-50"
                        >
                          {setCodeBusy ? 'Saving…' : 'Set 6-Digit Code'}
                        </button>
                      </div>
                      {setCodeError && <p className="text-[11px] text-red-600 font-semibold">{setCodeError}</p>}
                      {setCodeSuccess && <p className="text-[11px] text-[#157A4C] font-semibold">{setCodeSuccess}</p>}
                      {adminUnlockError && <p className="text-[11px] text-red-600 font-semibold">{adminUnlockError}</p>}
                      {adminDeleteError && <p className="text-[11px] text-red-600 font-semibold">{adminDeleteError}</p>}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={adminUnlockBusy || adminDeleteBusy}
                          onClick={handleAdminUnlock}
                          className="flex-1 py-1.5 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs disabled:opacity-50"
                        >
                          {adminUnlockBusy ? 'Unlocking…' : 'Unlock Lesson'}
                        </button>
                        <button
                          type="button"
                          disabled={adminUnlockBusy || adminDeleteBusy}
                          onClick={handleAdminDelete}
                          className="flex-1 py-1.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs disabled:opacity-50"
                        >
                          {adminDeleteBusy ? 'Deleting…' : 'Delete from Drive'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Case B: Simplified Community Edit Form */
              <div className="space-y-2">
                {/* Field 1: English */}
                <div>
                  <label htmlFor="edit-english" className="block text-xs font-bold text-[#3A453D] mb-1">
                    English word or phrase
                  </label>
                  <input
                    id="edit-english"
                    type="text"
                    value={editEnglish}
                    onChange={(e) => setEditEnglish(e.target.value)}
                    className="w-full py-1.5 px-3 rounded-xl bg-white border border-[#DED6C4] text-[15px] text-[#1C241E] focus:outline-none focus:border-[#157A4C]"
                  />
                </div>

                {/* Field 2: Edo Translation */}
                <div>
                  <label htmlFor="edit-edo" className="block text-xs font-bold text-[#3A453D] mb-1">
                    Edo spelling or translation
                  </label>
                  <input
                    id="edit-edo"
                    ref={editEdoInputRef}
                    type="text"
                    value={editEdoText}
                    onChange={(e) => setEditEdoText(e.target.value)}
                    className="w-full py-1.5 px-3 rounded-xl bg-white border border-[#DED6C4] text-[15px] text-[#1C241E] focus:outline-none focus:border-[#157A4C]"
                  />
                  {/* Edo letters with cursor insertion */}
                  <EdoLetterBar
                    inputRef={editEdoInputRef}
                    value={editEdoText}
                    onChange={setEditEdoText}
                    className="mt-1"
                  />
                </div>

                {/* Playback Permission Renewal Callout for Older Denied Records */}
                {selectedEntry.playbackPermission === 'denied' && (
                  <div className="p-2.5 bg-[#FEF3C7] border border-[#FCD34D] rounded-2xl text-xs text-[#92400E] space-y-1.5">
                    <p className="font-bold">
                      Shared library playback is currently restricted for this recording.
                    </p>
                    {selectedEntry.cloudMetadataFileId && (
                      <button
                        type="button"
                        disabled={permissionRenewBusy}
                        onClick={handleRenewPermission}
                        className="py-1.5 px-3 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white font-bold text-xs transition disabled:opacity-50"
                      >
                        {permissionRenewBusy ? 'Granting Permission…' : 'Grant Library Playback Permission'}
                      </button>
                    )}
                  </div>
                )}

                {/* Field 3: Voice Pronunciation & Replace Voice */}
                <div className="p-2.5 bg-white border border-[#E6DFCF] rounded-2xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#3A453D]">Voice Pronunciation</span>
                    {newAudioDataUrl ? (
                      <span className="text-[11px] font-bold text-[#157A4C] flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> New voice recorded
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#7C857E]">Current voice saved</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Play Button */}
                    <button
                      type="button"
                      onClick={() => {
                        if (newAudioDataUrl) {
                          handlePlayModalAudio(newAudioDataUrl, newAudioDuration);
                        } else {
                          handlePlayWordAudio({ stopPropagation: () => {} } as any, selectedEntry);
                        }
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#E5F4EC] hover:bg-[#D2ECDF] text-[#157A4C] font-bold text-xs flex items-center justify-center gap-1.5 transition"
                    >
                      <Play className="w-3.5 h-3.5 fill-[#157A4C]" />
                      <span>{playingId ? 'Playing…' : newAudioDataUrl ? 'Listen to New Voice' : 'Listen to Voice'}</span>
                    </button>

                    {/* Record / Replace Voice Button */}
                    {isRecordingNewVoice ? (
                      <button
                        type="button"
                        onClick={handleStopRecording}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#DC2626] text-white font-bold text-xs flex items-center justify-center gap-1.5 animate-pulse"
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>Stop ({recordingSeconds}s)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStartRecording}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#F3EDE0] hover:bg-[#EAE0CD] text-[#3A453D] font-bold text-xs flex items-center justify-center gap-1.5 transition"
                      >
                        <Mic className="w-3.5 h-3.5 text-[#157A4C]" />
                        <span>{newAudioDataUrl ? 'Record Again' : 'Replace Voice'}</span>
                      </button>
                    )}
                  </div>

                  {newAudioDataUrl && (
                    <p className="text-[11px] text-[#556058] text-center leading-snug pt-0.5 px-1">
                      By submitting your recording, you agree to share it for listening in the Edo Language Studio Library. Your voice will not be used for AI training.
                    </p>
                  )}
                </div>

                {modalError && (
                  <p role="alert" className="text-xs text-red-600 font-semibold">{modalError}</p>
                )}
                {modalSuccess && (
                  <p role="status" className="text-xs text-[#157A4C] font-semibold">{modalSuccess}</p>
                )}

                {/* Single Save Button */}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleSaveChanges}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#157A4C] hover:bg-[#126941] text-white font-bold text-sm shadow-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span>{busy ? 'Saving Changes…' : 'Save Changes'}</span>
                </button>

                {/* Administrator Approval Option (6-digit approval code or owner admin controls) */}
                {selectedEntry.cloudMetadataFileId && (
                  <div className="pt-2 border-t border-[#E6DFCF]">
                    <button
                      type="button"
                      onClick={() => setShowAdminLock(!showAdminLock)}
                      className="w-full py-0.5 text-xs font-semibold text-[#556058] flex items-center justify-between hover:text-[#1A241D]"
                    >
                      <span>Administrator options</span>
                      {showAdminLock ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showAdminLock && (
                      <div className="mt-2 p-2.5 bg-white border border-[#E6DFCF] rounded-xl space-y-2">
                        {/* Compact Mode Switcher: 6-Digit Approval vs Owner Admin */}
                        <div className="flex rounded-lg bg-[#F3EDE0] p-0.5 text-[11px] font-bold">
                          <button
                            type="button"
                            onClick={() => {
                              setAdminMode('code');
                              setAdminLockError(null);
                              setAdminDeleteError(null);
                            }}
                            className={`flex-1 py-1 rounded-md transition ${
                              adminMode === 'code'
                                ? 'bg-white text-[#157A4C] shadow-2xs'
                                : 'text-[#556058] hover:text-[#1A241D]'
                            }`}
                          >
                            6-Digit Approval
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAdminMode('owner');
                              setAdminLockError(null);
                              setAdminDeleteError(null);
                            }}
                            className={`flex-1 py-1 rounded-md transition ${
                              adminMode === 'owner'
                                ? 'bg-white text-[#157A4C] shadow-2xs'
                                : 'text-[#556058] hover:text-[#1A241D]'
                            }`}
                          >
                            Owner Admin
                          </button>
                        </div>

                        {adminMode === 'code' ? (
                          <div className="space-y-1.5">
                            <label htmlFor="trusted-approval-code" className="block text-[11px] font-bold text-[#1A241D]">
                              Trusted 6-Digit Approval Number
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                id="trusted-approval-code"
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={approvalCodeInput}
                                onChange={(e) => setApprovalCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="6-digit number"
                                className="flex-1 py-1.5 px-3 rounded-xl border border-[#DED6C4] text-xs tracking-widest font-mono focus:outline-none focus:border-[#157A4C]"
                              />
                              <button
                                type="button"
                                disabled={adminLockBusy}
                                onClick={handleApproveWithCode}
                                className="py-1.5 px-3.5 rounded-xl bg-[#157A4C] hover:bg-[#126941] text-white font-bold text-xs shrink-0 disabled:opacity-50"
                              >
                                {adminLockBusy ? 'Approving…' : 'Approve & Lock'}
                              </button>
                            </div>
                            {adminLockError && <p className="text-[11px] text-red-600 font-semibold">{adminLockError}</p>}
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <input
                              id="admin-lock-token"
                              type="password"
                              value={adminTokenInput}
                              onChange={(e) => setAdminTokenInput(e.target.value)}
                              placeholder="Enter owner admin token"
                              className="w-full py-1.5 px-3 rounded-xl border border-[#DED6C4] text-xs focus:outline-none focus:border-[#157A4C]"
                            />
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={newApprovalCodeInput}
                                onChange={(e) => setNewApprovalCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                placeholder="Set 6-digit approval code"
                                className="flex-1 py-1.5 px-2.5 rounded-xl border border-[#DED6C4] text-xs tracking-widest font-mono focus:outline-none focus:border-[#157A4C]"
                              />
                              <button
                                type="button"
                                disabled={setCodeBusy}
                                onClick={handleSetApprovalCode}
                                className="py-1.5 px-3 rounded-xl bg-[#3A453D] hover:bg-[#1C241E] text-white font-bold text-xs shrink-0 disabled:opacity-50"
                              >
                                {setCodeBusy ? 'Saving…' : 'Set 6-Digit Code'}
                              </button>
                            </div>
                            {setCodeError && <p className="text-[11px] text-red-600 font-semibold">{setCodeError}</p>}
                            {setCodeSuccess && <p className="text-[11px] text-[#157A4C] font-semibold">{setCodeSuccess}</p>}
                            {adminLockError && <p className="text-[11px] text-red-600 font-semibold">{adminLockError}</p>}
                            {adminDeleteError && <p className="text-[11px] text-red-600 font-semibold">{adminDeleteError}</p>}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={adminLockBusy || adminDeleteBusy}
                                onClick={handleAdminLock}
                                className="flex-1 py-1.5 rounded-xl bg-[#157A4C] hover:bg-[#126941] text-white font-bold text-xs disabled:opacity-50"
                              >
                                {adminLockBusy ? 'Approving…' : 'Approve & Lock'}
                              </button>
                              <button
                                type="button"
                                disabled={adminLockBusy || adminDeleteBusy}
                                onClick={handleAdminDelete}
                                className="flex-1 py-1.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs disabled:opacity-50"
                              >
                                {adminDeleteBusy ? 'Deleting…' : 'Delete from Drive'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
