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
  ChevronUp
} from 'lucide-react';
import { EdoEntry } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';
import { WordIllustration } from '../components/WordIllustration';
import { playAudioRecording, stopActivePlayback, MicrophoneRecorder } from '../services/audioService';
import { getCommunityAudio } from '../services/communityLibrary';
import { adminLockEntry, adminUnlockEntry, adminDeleteEntry, recordPlaybackToGateway } from '../services/cloudSyncService';

export interface LanguageLibraryScreenProps {
  entries: EdoEntry[];
  onCommunitySync?: () => Promise<void>;
  communityBusy?: boolean;
  communityError?: string;
  communityCheckedAt?: string;
  pendingSpellingCount?: number;
  recordings?: any[];
  queueCount?: number;
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

  // Real human voice audio must be present (not sample metadata without audio)
  const hasValidLocalAudio = Boolean(entry.audioDataUrl && typeof entry.audioDataUrl === 'string' && entry.audioDataUrl.startsWith('data:audio/'));
  const hasValidCloudAudio = Boolean(entry.cloudAudioFileId && entry.cloudAudioFileId.trim() && entry.playbackPermission !== 'denied');
  const hasRealAudio = Boolean(entry.hasAudio && (hasValidLocalAudio || hasValidCloudAudio));

  // Must be verified cloud record or valid local recording
  const isOnlineSynced = (entry.syncStatus === 'synced_to_drive' && Boolean(entry.cloudMetadataFileId) && Boolean(entry.cloudAudioFileId) && entry.playbackPermission !== 'denied') || hasValidLocalAudio;

  return Boolean(hasEnglish && hasEdo && hasRealAudio && isOnlineSynced);
}

export const LanguageLibraryScreen: React.FC<LanguageLibraryScreenProps> = ({
  entries,
  onLibraryChanged,
  onEditText,
  onSaveEntry,
  onBackToDashboard
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedEntry] = useState<EdoEntry | null>(null);
  const selectedEntry = selectedSnapshot ? entries.find(entry => entry.id === selectedSnapshot.id) || selectedSnapshot : null;

  // Edit modal state
  const [editEnglish, setEditEnglish] = useState('');
  const [editEdoText, setEditEdoText] = useState('');
  const [newAudioDataUrl, setNewAudioDataUrl] = useState<string | null>(null);
  const [newAudioDuration, setNewAudioDuration] = useState<number>(0);
  const [isRecordingNewVoice, setIsRecordingNewVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);

  // Admin lock, unlock, and delete expandable state
  const [showAdminUnlock, setShowAdminUnlock] = useState(false);
  const [showAdminLock, setShowAdminLock] = useState(false);
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [adminUnlockBusy, setAdminUnlockBusy] = useState(false);
  const [adminUnlockError, setAdminUnlockError] = useState<string | null>(null);
  const [adminLockBusy, setAdminLockBusy] = useState(false);
  const [adminLockError, setAdminLockError] = useState<string | null>(null);
  const [adminDeleteBusy, setAdminDeleteBusy] = useState(false);
  const [adminDeleteError, setAdminDeleteError] = useState<string | null>(null);

  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      stopActivePlayback();
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (recorderRef.current) recorderRef.current.cancel();
    };
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [searchQuery, activeFilter]);

  // When opening an entry, initialize edit fields
  const handleOpenEntry = (entry: EdoEntry) => {
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
    setAdminTokenInput('');
    setAdminUnlockError(null);
    setAdminLockError(null);
    setAdminDeleteError(null);
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
  const completedEntries = entries.filter(isCompletedLesson);

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

  // Requirement 5: Speaker button strictly plays the Edo voice recording
  const handlePlayWordAudio = async (e: React.MouseEvent, entry: EdoEntry) => {
    e.stopPropagation();
    if (!entry.hasAudio) return;

    if (playingId === entry.id) {
      stopActivePlayback();
      setPlayingId(null);
      return;
    }

    const trackPlayback = () => {
      if (entry.cloudMetadataFileId) {
        void recordPlaybackToGateway(entry.cloudMetadataFileId).then(res => {
          if (res.ok && (res.autoLocked || res.reviewStatus === 'approved_locked')) {
            void onLibraryChanged?.();
          }
        }).catch(() => {});
      }
    };

    // Case 1: Local recorded audio bytes are present
    if (entry.audioDataUrl && typeof entry.audioDataUrl === 'string' && entry.audioDataUrl.startsWith('data:audio/')) {
      setPlayingId(entry.id);
      trackPlayback();
      playAudioRecording(
        entry.audioDataUrl,
        entry.audioDurationSec || 3,
        (_sec, playing) => {
          if (!playing) setPlayingId(null);
        },
        {
          allowDemoFallback: false,
          onError: () => setPlayingId(null)
        }
      );
      return;
    }

    // Case 2: Audio was uploaded & verified in Google Drive; stream real audio from gateway
    if (entry.cloudAudioFileId) {
      setPlayingId(entry.id);
      try {
        const audioUrl = await getCommunityAudio(entry);
        if (!audioUrl) {
          setPlayingId(null);
          return;
        }
        trackPlayback();
        playAudioRecording(
          audioUrl,
          entry.audioDurationSec || 3,
          (_sec, playing) => {
            if (!playing) setPlayingId(null);
          },
          {
            allowDemoFallback: false,
            onError: () => setPlayingId(null)
          }
        );
      } catch (err) {
        console.warn('Audio streaming failed:', err);
        setPlayingId(null);
      }
      return;
    }

    // Case 3: No real recording exists; do NOT substitute synthetic speech or beep tones
    setPlayingId(null);
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

  // Save changes from single edit modal
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

    setBusy(true);
    try {
      if (onSaveEntry) {
        await onSaveEntry(selectedEntry.id, {
          english: eng,
          edoText: edo,
          audioDataUrl: newAudioDataUrl || undefined,
          durationSec: newAudioDuration || undefined
        });
      } else if (onEditText) {
        await onEditText(selectedEntry.id, edo);
      }
      setModalSuccess('Changes saved successfully.');
      window.setTimeout(() => {
        handleCloseModal();
      }, 700);
    } catch (err: any) {
      setModalError(err?.message || 'Failed to save changes.');
    } finally {
      setBusy(false);
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
        rightAction="close"
        onRightAction={onBackToDashboard}
        onLogoClick={onBackToDashboard}
      />

      {/* Subtitle / Counter */}
      <p className="px-5 pt-1 pb-1 text-xs text-[#556058] font-medium" role="status">
        {completedEntries.length} completed {completedEntries.length === 1 ? 'lesson' : 'lessons'} in Library
      </p>

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

      {/* Word Cards List — Requirement 4: Small, Compact 2-Line Cards */}
      <div ref={listRef} className="w-full px-5 pb-5 flex-1 overflow-y-auto space-y-2 min-h-0">
        {visibleEntries.map((entry) => {
          const isPlayingThis = playingId === entry.id;
          const isLocked = entry.reviewStatus === 'approved_locked';
          const isVerifiedCloud = Boolean(
            entry.cloudMetadataFileId &&
            entry.cloudAudioFileId &&
            entry.playbackPermission !== 'denied' &&
            entry.syncStatus === 'synced_to_drive'
          );
          const isLocalOnly = Boolean(entry.audioDataUrl && !isVerifiedCloud);

          return (
            <div
              key={entry.id}
              className="w-full rounded-2xl bg-white hover:bg-[#FCF9F2] border border-[#E6DFCF] px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-xs transition"
            >
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#FAF6EC] flex items-center justify-center shrink-0">
                  <WordIllustration
                    illustrationKey={entry.illustrationKey}
                    emoji={entry.emoji}
                    size="sm"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  {/* Line 1: English (Full text visible, wraps cleanly) */}
                  <p className="text-[14.5px] leading-snug font-semibold text-[#1A241D] break-words whitespace-normal select-text">
                    <span className="text-[#68766E] font-medium text-[13px]">English:</span> {entry.english}
                  </p>

                  {/* Line 2: Edo (Full spelling visible, with small status dot or lock) */}
                  <p className="text-[14px] leading-snug text-[#157A4C] break-words whitespace-normal mt-0.5 flex items-center gap-1.5 flex-wrap select-text">
                    <span className="text-[#68766E] font-medium text-[13px]">Edo:</span>
                    <span className="font-bold text-[#1F2922]">{entry.edoText}</span>
                    {isLocked ? (
                      <span title="Approved & Protected" className="inline-flex items-center">
                        <Lock className="w-3.5 h-3.5 text-[#157A4C] shrink-0" />
                      </span>
                    ) : isVerifiedCloud ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-[#16A34A] shrink-0" title="Verified online with cloud recording" />
                    ) : isLocalOnly ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-[#2563EB] shrink-0" title="Local recording waiting to synchronize" />
                    ) : null}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Speaker (Listen) and Pencil (Edit) */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Speaker Button — Strictly plays recorded Edo human voice */}
                <button
                  type="button"
                  onClick={(e) => handlePlayWordAudio(e, entry)}
                  aria-label={`${isPlayingThis ? 'Stop' : 'Play'} recorded Edo pronunciation for ${entry.english}`}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition shrink-0 ${
                    isPlayingThis
                      ? 'bg-[#157A4C] text-white scale-105 shadow-xs'
                      : 'bg-[#E5F4EC] hover:bg-[#D2ECDF] text-[#157A4C]'
                  }`}
                >
                  <Volume2 className="w-4 h-4 stroke-[2.3]" />
                </button>

                {/* Edit Button (Pencil) — ONLY this opens the editing window */}
                {!isLocked ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEntry(entry);
                    }}
                    aria-label={`Edit ${entry.english}`}
                    title="Edit lesson"
                    className="w-8 h-8 rounded-full bg-[#F4EFE2] hover:bg-[#EAE0CE] text-[#556058] hover:text-[#18241B] flex items-center justify-center transition shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEntry(entry);
                    }}
                    aria-label={`Protected lesson: ${entry.english}`}
                    title="Protected lesson (Administrator options)"
                    className="w-8 h-8 rounded-full bg-[#EBF7EE] text-[#157A4C] flex items-center justify-center transition shrink-0 opacity-80 hover:opacity-100"
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {visibleEntries.length === 0 && (
          <div className="py-10 text-center text-[#5A655D] text-[14px]">
            No completed lessons found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </div>

      {/* Simplified Single-Screen Mobile Details / Edit Modal */}
      {selectedEntry && (
        <div
          onClick={handleCloseModal}
          className="absolute inset-0 bg-black/40 z-20 flex items-end justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[85dvh] overflow-y-auto rounded-3xl bg-[#FAF7F0] border border-[#E0D8C6] p-4.5 shadow-xl flex flex-col gap-3"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[#E6DFCF]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-white border border-[#E0D8C6] flex items-center justify-center">
                  <WordIllustration
                    illustrationKey={selectedEntry.illustrationKey}
                    emoji={selectedEntry.emoji}
                    size="sm"
                  />
                </div>
                <h3 className="text-[17px] font-bold text-[#18241B]">
                  {selectedEntry.reviewStatus === 'approved_locked' ? 'Protected Lesson' : 'Edit Lesson'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="w-8 h-8 rounded-full bg-[#EFE9DA] flex items-center justify-center text-[#3A453D] hover:bg-[#E2DAC7]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Case A: Approved & Locked (Read-Only) */}
            {selectedEntry.reviewStatus === 'approved_locked' ? (
              <div className="space-y-3">
                <div className="p-3 bg-[#EBF7EE] border border-[#BDE5C8] rounded-2xl flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-[#157A4C] shrink-0" />
                  <p className="text-xs text-[#126941] font-semibold leading-relaxed">
                    This lesson has been approved and locked by an administrator. It is protected and cannot be edited by community users.
                  </p>
                </div>

                <div className="bg-white border border-[#E6DFCF] rounded-2xl p-3.5 space-y-2">
                  <div>
                    <span className="text-xs font-semibold text-[#68766E]">English</span>
                    <p className="text-[15.5px] font-bold text-[#1A241D]">{selectedEntry.english}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-[#68766E]">Edo Spelling</span>
                    <p className="text-[15.5px] font-bold text-[#157A4C]">{selectedEntry.edoText}</p>
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

                {/* Administrator Unlock Option */}
                <div className="pt-2 border-t border-[#E6DFCF]">
                  <button
                    type="button"
                    onClick={() => setShowAdminUnlock(!showAdminUnlock)}
                    className="text-xs font-semibold text-[#556058] flex items-center gap-1 hover:text-[#1A241D]"
                  >
                    <span>Administrator options</span>
                    {showAdminUnlock ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showAdminUnlock && (
                    <div className="mt-2.5 p-3 bg-white border border-[#E6DFCF] rounded-xl space-y-2">
                      <label htmlFor="admin-unlock-token" className="text-xs font-bold text-[#1A241D]">
                        Administrator Token
                      </label>
                      <input
                        id="admin-unlock-token"
                        type="password"
                        value={adminTokenInput}
                        onChange={(e) => setAdminTokenInput(e.target.value)}
                        placeholder="Enter admin token"
                        className="w-full py-2 px-3 rounded-xl border border-[#DED6C4] text-xs focus:outline-none focus:border-[#157A4C]"
                      />
                      {adminUnlockError && <p className="text-xs text-red-600 font-semibold">{adminUnlockError}</p>}
                      {adminDeleteError && <p className="text-xs text-red-600 font-semibold">{adminDeleteError}</p>}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={adminUnlockBusy || adminDeleteBusy}
                          onClick={handleAdminUnlock}
                          className="flex-1 py-2 rounded-xl bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs disabled:opacity-50"
                        >
                          {adminUnlockBusy ? 'Unlocking…' : 'Unlock Lesson'}
                        </button>
                        <button
                          type="button"
                          disabled={adminUnlockBusy || adminDeleteBusy}
                          onClick={handleAdminDelete}
                          className="flex-1 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs disabled:opacity-50"
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
              <div className="space-y-3">
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
                    className="w-full py-2 px-3.5 rounded-xl bg-white border border-[#DED6C4] text-[15px] text-[#1C241E] focus:outline-none focus:border-[#157A4C]"
                  />
                </div>

                {/* Field 2: Edo Translation */}
                <div>
                  <label htmlFor="edit-edo" className="block text-xs font-bold text-[#3A453D] mb-1">
                    Edo spelling or translation
                  </label>
                  <input
                    id="edit-edo"
                    type="text"
                    value={editEdoText}
                    onChange={(e) => setEditEdoText(e.target.value)}
                    className="w-full py-2 px-3.5 rounded-xl bg-white border border-[#DED6C4] text-[15px] text-[#1C241E] focus:outline-none focus:border-[#157A4C]"
                  />
                </div>

                {/* Field 3: Voice Pronunciation & Replace Voice */}
                <div className="p-3 bg-white border border-[#E6DFCF] rounded-2xl space-y-2">
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

                {/* Administrator Approval Option (Locks contribution permanently) */}
                {selectedEntry.cloudMetadataFileId && (
                  <div className="pt-2 border-t border-[#E6DFCF]">
                    <button
                      type="button"
                      onClick={() => setShowAdminLock(!showAdminLock)}
                      className="text-xs font-semibold text-[#556058] flex items-center gap-1 hover:text-[#1A241D]"
                    >
                      <span>Administrator options</span>
                      {showAdminLock ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showAdminLock && (
                      <div className="mt-2.5 p-3 bg-white border border-[#E6DFCF] rounded-xl space-y-2">
                        <label htmlFor="admin-lock-token" className="text-xs font-bold text-[#1A241D]">
                          Administrator Token
                        </label>
                        <input
                          id="admin-lock-token"
                          type="password"
                          value={adminTokenInput}
                          onChange={(e) => setAdminTokenInput(e.target.value)}
                          placeholder="Enter admin token"
                          className="w-full py-2 px-3 rounded-xl border border-[#DED6C4] text-xs focus:outline-none focus:border-[#157A4C]"
                        />
                        {adminLockError && <p className="text-xs text-red-600 font-semibold">{adminLockError}</p>}
                        {adminDeleteError && <p className="text-xs text-red-600 font-semibold">{adminDeleteError}</p>}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            disabled={adminLockBusy || adminDeleteBusy}
                            onClick={handleAdminLock}
                            className="flex-1 py-2 rounded-xl bg-[#157A4C] hover:bg-[#126941] text-white font-bold text-xs disabled:opacity-50"
                          >
                            {adminLockBusy ? 'Approving…' : 'Approve & Lock'}
                          </button>
                          <button
                            type="button"
                            disabled={adminLockBusy || adminDeleteBusy}
                            onClick={handleAdminDelete}
                            className="flex-1 py-2 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-bold text-xs disabled:opacity-50"
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
        </div>
      )}
    </div>
  );
};
