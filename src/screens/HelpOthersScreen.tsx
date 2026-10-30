import React, { useState, useRef, useEffect } from 'react';
import {
  Headphones,
  Play,
  Pause,
  ArrowRight,
  Mic,
  Square,
  FileEdit,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { getCommunityAudio, getHelpOthersEligibleEntries } from '../services/communityLibrary';
import { EdoEntry } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';
import {
  playAudioRecording,
  stopActivePlayback,
  formatDuration,
  MicrophoneRecorder,
  getCachedSessionAudio
} from '../services/audioService';
import { WordIllustration } from '../components/WordIllustration';
import { EdoLetterBar } from '../components/EdoLetterBar';

interface HelpOthersScreenProps {
  entries: EdoEntry[];
  tombstones?: string[];
  communityError?: string;
  communityCheckedAt?: string;
  onAttachWritingToEntry: (entryId: string, edoText: string) => Promise<void>;
  onAttachAudioToEntry: (
    entryId: string,
    audioDataUrl: string,
    durationSec: number,
    playbackAllowed?: boolean
  ) => Promise<void>;
  onBackToDashboard: () => void;
}

const EDO_SPECIAL_CHARS = ['ẹ', 'ọ', 'vb', 'gh', 'kh', 'mw', 'rh'];

export const HelpOthersScreen: React.FC<HelpOthersScreenProps> = ({
  entries,
  tombstones = [],
  communityError,
  communityCheckedAt,
  onAttachWritingToEntry,
  onAttachAudioToEntry,
  onBackToDashboard
}) => {
  const [helpMode, setHelpMode] = useState<'write' | 'record'>('write');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(() => new Set());

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [playbackSec, setPlaybackSec] = useState(0);

  // Audio recording state (for "Needs Voice" mode)
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [capturedAudioUrl, setCapturedAudioUrl] = useState<string | undefined>(undefined);
  const [capturedDuration, setCapturedDuration] = useState(3);

  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const writingInputRef = useRef<HTMLInputElement | null>(null);

  // Use authoritative Help Others eligibility calculation
  const eligible = getHelpOthersEligibleEntries(entries, tombstones, submittedIds);
  const needsWritingList = eligible.needsWritingList;
  const needsAudioList = eligible.needsAudioList;

  const activeList = helpMode === 'write' ? needsWritingList : needsAudioList;
  const safeIndex = activeList.length > 0 ? currentIndex % activeList.length : 0;
  const currentItem = activeList[safeIndex];

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopActivePlayback();
      setIsLoadingAudio(false);
      setIsPlaying(false);
    };
  }, []);

  useEffect(() => {
    stopActivePlayback();
    setIsLoadingAudio(false);
    setIsPlaying(false);
    setPlaybackSec(0);
  }, [currentIndex, helpMode]);

  const showTransientMessage = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => setFeedbackBanner(null), 2800);
  };

  const handlePlayExistingAudio = async () => {
    if (!currentItem) return;
    if (isPlaying) {
      stopActivePlayback();
      setIsPlaying(false);
      setIsLoadingAudio(false);
      return;
    }
    if (isLoadingAudio) return;

    const duration = currentItem.audioDurationSec || 4;
    let audio: string;

    // If audio is not yet cached locally or in session memory, show loading indicator immediately
    const cacheKey = currentItem.cloudAudioFileId || '';
    const hasCachedAudio = Boolean(currentItem.audioDataUrl || (cacheKey && getCachedSessionAudio(cacheKey)));
    if (!hasCachedAudio) {
      setIsLoadingAudio(true);
    }

    try {
      audio = currentItem.audioDataUrl || await getCommunityAudio(currentItem);
    } catch (error) {
      setIsLoadingAudio(false);
      setIsPlaying(false);
      showTransientMessage(String(error || 'Could not load audio recording.'));
      return;
    }

    // Audio is ready to play: clear loading indicator and start playback
    setIsLoadingAudio(false);
    setIsPlaying(true);
    playAudioRecording(
      audio,
      duration,
      (sec, playing) => {
        setPlaybackSec(sec);
        setIsPlaying(playing);
        if (!playing) {
          setIsLoadingAudio(false);
        }
      },
      {
        allowDemoFallback: false,
        onError: (err) => {
          setIsPlaying(false);
          setIsLoadingAudio(false);
          showTransientMessage(err || 'Unable to play this audio recording.');
        }
      }
    );
  };

  const handleSaveWriting = async () => {
    if (!currentItem || isSubmitting) return;
    const trimmed = writtenAnswer.trim();
    if (!trimmed) {
      showTransientMessage('Please type the Edo writing or tap "Skip this" if unsure.');
      return;
    }
    setIsSubmitting(true);
    stopActivePlayback();
    setIsLoadingAudio(false);
    setIsPlaying(false);
    const targetItem = currentItem;
    const savedEnglish = targetItem.english;

    // Immediately remove from screen view & prevent duplicate submission
    setSubmittedIds((prev) => {
      const next = new Set(prev);
      if (targetItem.id) next.add(targetItem.id);
      if (targetItem.cloudMetadataFileId) next.add(targetItem.cloudMetadataFileId);
      return next;
    });

    // Reset input state immediately
    setWrittenAnswer('');

    // Immediate acknowledgment with exact required phrasing
    showTransientMessage(
      `Thank you! Your Edo contribution for "${savedEnglish}" was saved locally and is uploading in the background.`
    );

    // Save locally and trigger background upload without blocking UI
    try {
      await onAttachWritingToEntry(targetItem.id, trimmed);
    } catch (error) {
      console.warn('[HelpOthers] Local save warning:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipItem = () => {
    if (isSubmitting) return;
    stopActivePlayback();
    setIsLoadingAudio(false);
    setIsPlaying(false);
    setWrittenAnswer('');
    setCapturedAudioUrl(undefined);
    showTransientMessage('Thank you! Here is another unfinished contribution.');
    setCurrentIndex((prev) => prev + 1);
  };

  const handleToggleRecordForWrittenEntry = async () => {
    if (isSubmitting) return;
    if (!isRecording) {
      stopActivePlayback();
      setIsLoadingAudio(false);
      const recorder = new MicrophoneRecorder();
      recorderRef.current = recorder;
      const startRes = await recorder.start();
      if (!startRes.ok) {
        recorderRef.current = null;
        showTransientMessage(
          startRes.errorMessage || 'Microphone access was denied. Please check permissions.'
        );
        return;
      }
      setIsRecording(true);
      setRecordSec(0);
      timerRef.current = window.setInterval(() => {
        setRecordSec((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      if (recorderRef.current) {
        const res = await recorderRef.current.stop();
        recorderRef.current = null;
        if (!res.ok || !res.audioDataUrl) {
          setCapturedAudioUrl(undefined);
          showTransientMessage(
            res.errorMessage || 'No voice detected. Please speak clearly and record again.'
          );
          return;
        }
        setCapturedAudioUrl(res.audioDataUrl);
        setCapturedDuration(res.durationSec);

        // Automatically play the recorded voice once without looping
        setIsPlaying(true);
        playAudioRecording(
          res.audioDataUrl,
          res.durationSec,
          (sec, playing) => {
            setPlaybackSec(sec);
            setIsPlaying(playing);
          },
          {
            allowDemoFallback: false,
            onError: () => setIsPlaying(false)
          }
        );
      }
    }
  };

  const handleSaveRecordedAudioForWrittenEntry = async () => {
    if (!currentItem || !capturedAudioUrl || isSubmitting) return;
    setIsSubmitting(true);
    stopActivePlayback();
    setIsLoadingAudio(false);
    setIsPlaying(false);
    const targetItem = currentItem;
    const savedEnglish = targetItem.english;
    const audioUrl = capturedAudioUrl;
    const duration = capturedDuration;

    // Immediately remove from screen view & prevent duplicate submission
    setSubmittedIds((prev) => {
      const next = new Set(prev);
      if (targetItem.id) next.add(targetItem.id);
      if (targetItem.cloudMetadataFileId) next.add(targetItem.cloudMetadataFileId);
      return next;
    });

    // Reset audio state immediately
    setCapturedAudioUrl(undefined);
    setRecordSec(0);

    // Immediate acknowledgment with exact required phrasing
    showTransientMessage(
      `Thank you! Your Edo contribution for "${savedEnglish}" was saved locally and is uploading in the background.`
    );

    // Save locally and trigger background upload without blocking UI
    try {
      await onAttachAudioToEntry(targetItem.id, audioUrl, duration, true);
    } catch (error) {
      console.warn('[HelpOthers] Local save warning:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="edo-screen">
      {/* Unified Studio Header (Blue Section) */}
      <StudioHeader
        theme="blue"
        sectionLabel="Help Others"
        rightAction="close"
        onRightAction={onBackToDashboard}
        onLogoClick={onBackToDashboard}
      />

      {/* Mode Switcher: Write for Recorded Audio vs. Record for Written Edo */}
      <div className="w-full px-5 pt-1 pb-2 flex items-center gap-2.5 shrink-0">
        <button
          type="button"
          onClick={() => {
            stopActivePlayback();
            setHelpMode('write');
            setCurrentIndex(0);
          }}
          className={`flex-1 min-h-[42px] py-2 px-3 rounded-xl text-[13.5px] font-bold flex items-center justify-center gap-1.5 transition ${
            helpMode === 'write'
              ? 'bg-[#1D6CE0] text-white shadow-sm'
              : 'bg-[#E6ECF7] text-[#284472] hover:bg-[#D8E3F5]'
          }`}
        >
          <FileEdit className="w-4 h-4" />
          <span>Add Writing ({needsWritingList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            stopActivePlayback();
            setHelpMode('record');
            setCurrentIndex(0);
          }}
          className={`flex-1 min-h-[42px] py-2 px-3 rounded-xl text-[13.5px] font-bold flex items-center justify-center gap-1.5 transition ${
            helpMode === 'record'
              ? 'bg-[#1D6CE0] text-white shadow-sm'
              : 'bg-[#E6ECF7] text-[#284472] hover:bg-[#D8E3F5]'
          }`}
        >
          <Mic className="w-4 h-4" />
          <span>Add Voice ({needsAudioList.length})</span>
        </button>
      </div>

      {/* Main Content (px-5 matching Write the Word) */}
      <div className="edo-screen-scroll pt-1">
        {(communityError || !communityCheckedAt) && <p role="status" className="text-xs text-center text-[#556058] mb-2">{communityError || "Connecting to the shared collection…"}</p>}
        {feedbackBanner && (
          <div className="mb-2.5 px-4 py-2.5 rounded-2xl bg-[#E8F1FD] border border-[#BBD4FA] text-[#1552B0] text-[13.5px] font-bold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackBanner}</span>
          </div>
        )}

        {!currentItem ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-full bg-[#E8F1FD] text-[#1D6CE0] flex items-center justify-center mb-3">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h2 className="text-[21px] font-bold text-[#1C241E]">
              {communityError || !communityCheckedAt ? "Waiting for the shared collection" : "All caught up in this queue!"}
            </h2>
            <p className="text-[15px] text-[#556058] mt-1.5 mb-6">
              Switch tabs above or teach a new word in Teach Edo.
            </p>
            <button
              type="button"
              onClick={onBackToDashboard}
              className="px-6 py-2.5 rounded-xl bg-[#1D6CE0] hover:bg-[#1558BD] text-white text-[14px] font-bold shadow-sm transition"
            >
              Return to Dashboard
            </button>
          </div>
        ) : helpMode === 'write' ? (
          /* MODE 1: SOMEONE HAS ALREADY RECORDED THIS WORD -> NEEDS WRITING */
          <div className="w-full flex-1 flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-3.5 my-auto">
              {/* Warm Amber Info Banner from Screen 7 */}
              <div className="w-full rounded-2xl bg-[#FBF0D4] border border-[#DFBF7F]/50 px-4 py-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#F3DFB1] text-[#6B4A09] flex items-center justify-center shrink-0">
                  <Headphones className="w-5 h-5 stroke-[2.3]" />
                </div>
                <p className="text-[15px] font-bold text-[#3C2D0D] leading-snug">
                  Someone has already recorded this word.
                </p>
              </div>

              {/* English Phrase / Word with Picture */}
              <div className="pt-0.5 flex items-center gap-3.5">
                <WordIllustration
                  id={currentItem.sourceLessonId || currentItem.id}
                  english={currentItem.english}
                  illustrationKey={currentItem.illustrationKey}
                  imageUrl={currentItem.imageUrl}
                  size="md"
                />
                <div>
                  <p className="text-[21px] font-bold text-[#1A241D] leading-tight">
                    English: <span className="text-[#18241B]">{currentItem.english}</span>
                  </p>
                </div>
              </div>

              {/* Blue Audio Playback Card for Existing Recording */}
              <div className="w-full rounded-2xl bg-[#E6EFFC] border border-[#C3D9FA] px-4 py-4 flex items-center gap-3.5 shadow-sm">
                <button
                  type="button"
                  onClick={handlePlayExistingAudio}
                  disabled={isLoadingAudio}
                  aria-label={
                    isLoadingAudio
                      ? 'Loading audio recording'
                      : isPlaying
                      ? 'Pause audio'
                      : 'Play existing Edo recording'
                  }
                  className="w-12 h-12 rounded-full bg-[#1D6CE0] hover:bg-[#1558BD] text-white flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition disabled:opacity-90"
                >
                  {isLoadingAudio ? (
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  ) : isPlaying ? (
                    <Pause className="w-5 h-5 fill-white" />
                  ) : (
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  )}
                </button>

                {/* Blue Waveform Bars */}
                <div className="flex-1 flex items-center justify-between gap-[3px] h-8 px-1">
                  {[30, 55, 40, 80, 100, 65, 45, 75, 50, 90, 60, 40, 70, 50, 85, 45, 35].map(
                    (heightPct, idx) => (
                      <span
                        key={idx}
                        style={{ height: `${heightPct}%` }}
                        className={`w-1 rounded-full ${
                          isLoadingAudio
                            ? 'bg-[#3B82F6]/50 animate-pulse'
                            : isPlaying
                            ? 'bg-[#1D6CE0] animate-pulse'
                            : 'bg-[#3B82F6]/80'
                        }`}
                      />
                    )
                  )}
                </div>

                <span className="text-[13px] font-bold text-[#1E3A68] shrink-0">
                  {isLoadingAudio
                    ? 'Loading…'
                    : `${formatDuration(playbackSec)} / ${formatDuration(currentItem.audioDurationSec || 4)}`}
                </span>
              </div>

              {/* Writing Question & Text Box */}
              <div className="pt-1">
                <label className="block text-[18.5px] font-bold text-[#1C241E] mb-2">
                  Can you write this in Edo?
                </label>
                <input
                  type="text"
                  ref={writingInputRef}
                  value={writtenAnswer}
                  onChange={(e) => setWrittenAnswer(e.target.value)}
                  placeholder="Type the Edo words you hear..."
                  className="edo-input focus:border-[#1D6CE0] focus:ring-2 focus:ring-[#1D6CE0]/20"
                />

                {/* Quick Edo letters with cursor insertion */}
                <EdoLetterBar
                  inputRef={writingInputRef}
                  value={writtenAnswer}
                  onChange={setWrittenAnswer}
                  className="mt-2"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSaveWriting}
                className="edo-primary-btn bg-[#157A4C] hover:bg-[#11663F] text-white disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Saving…' : 'Save and continue'}</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSkipItem}
                className="edo-secondary-btn disabled:opacity-50"
              >
                <span>Skip this (I can&apos;t write it)</span>
              </button>
            </div>
          </div>
        ) : (
          /* MODE 2: WRITTEN EDO CONTRIBUTION THAT NEEDS PRONUNCIATION RECORDING */
          <div className="w-full flex-1 flex flex-col justify-between gap-4">
            <div className="flex flex-col gap-3.5 my-auto">
              <div className="w-full rounded-2xl bg-[#E8F1FD] border border-[#BFD6FA] px-4 py-3.5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1D6CE0] text-white flex items-center justify-center shrink-0">
                  <FileEdit className="w-5 h-5" />
                </div>
                <p className="text-[14.5px] font-bold text-[#183C73] leading-snug">
                  Someone wrote this in Edo. Can you record the pronunciation?
                </p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E2DAC7] p-4 flex flex-col items-center text-center shadow-sm">
                <div className="mb-2">
                  <WordIllustration
                    id={currentItem.sourceLessonId || currentItem.id}
                    english={currentItem.english}
                    illustrationKey={currentItem.illustrationKey}
                    imageUrl={currentItem.imageUrl}
                    size="md"
                  />
                </div>
                <p className="text-[15px] font-semibold text-[#5C675F]">
                  English: {currentItem.english}
                </p>
                <p className="text-[25px] font-bold text-[#1D6CE0] mt-0.5">
                  Edo: {currentItem.edoText}
                </p>
              </div>

              <div className="flex flex-col items-center py-2">
                <button
                  type="button"
                  onClick={handleToggleRecordForWrittenEntry}
                  className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg border-4 transition ${
                    isRecording
                      ? 'bg-[#C93B2B] border-[#F8D7D3] animate-pulse'
                      : 'bg-[#1D6CE0] hover:bg-[#1658B8] border-[#D3E3FC]'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-8 h-8 text-white fill-white" />
                  ) : (
                    <Mic className="w-10 h-10 text-white" />
                  )}
                </button>
                <span className="text-[14px] font-bold text-[#2E3B32] mt-2.5">
                  {isRecording
                    ? `Recording... ${formatDuration(recordSec)} (Tap to stop)`
                    : capturedAudioUrl
                    ? 'Voice recorded! Tap Save below or tap mic to re-record'
                    : 'Tap microphone to record pronunciation'}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              {capturedAudioUrl && (
                <p className="text-[11.5px] text-[#556058] text-center leading-relaxed px-1">
                  By submitting your recording, you agree to share it for listening in the Edo Language Studio Library. Your voice will not be used for AI training.
                </p>
              )}
              <button
                type="button"
                disabled={!capturedAudioUrl || isSubmitting}
                onClick={handleSaveRecordedAudioForWrittenEntry}
                className="edo-primary-btn bg-[#1D6CE0] hover:bg-[#1658B8] disabled:opacity-45 text-white"
              >
                <span>{isSubmitting ? 'Saving…' : 'Save Pronunciation'}</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSkipItem}
                className="edo-secondary-btn disabled:opacity-50"
              >
                <span>Skip this</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
