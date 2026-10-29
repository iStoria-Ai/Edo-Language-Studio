import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  ArrowRight,
  CheckCircle2,
  Check,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { fetchAnsweredQuestions, nextUnansweredQuestion } from '../services/communityLibrary';
import { lessonProgress } from '../services/storageService';
import { EdoEntry, TeachStepState } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';
import { WordIllustration } from '../components/WordIllustration';
import {
  speakEnglishPrompt,
  stopEnglishPrompt,
  playEnglishPronunciation,
  EnglishSpeechSpeed,
  MicrophoneRecorder,
  playAudioRecording,
  stopActivePlayback,
  revokeAudioObjectUrl,
  formatDuration
} from '../services/audioService';

interface TeachEdoScreenProps {
  questions: EdoEntry[];
  initialStepState?: TeachStepState;
  onSaveVoiceContribution: (
    entryId: string,
    audioDataUrl: string,
    durationSec: number,
    edoText?: string,
    playbackAllowed?: boolean
  ) => Promise<void>;
  onSaveWritingForContribution: (entryId: string, edoText: string) => Promise<void>;
  onSkipWritingKeepVoice: (entryId: string) => Promise<void>;
  onOpenTeachSomethingElse: () => void;
  onFinishForNow: () => void;
  onStepStateChange?: (step: TeachStepState) => void;
}

const EDO_SPECIAL_CHARS = ['ẹ', 'ọ', 'vb', 'gh', 'kh', 'mw', 'rh'];

export const TeachEdoScreen: React.FC<TeachEdoScreenProps> = ({
  questions,
  initialStepState = 'prompt',
  onSaveVoiceContribution,
  onSaveWritingForContribution,
  onSkipWritingKeepVoice,
  onOpenTeachSomethingElse,
  onFinishForNow,
  onStepStateChange
}) => {
  const [questionIndex, setQuestionIndex] = useState(() => Math.max(0, questions.findIndex(q => !q.hasAudio)));
  const [answeredIds, setAnsweredIds] = useState<Set<string> | null>(null);
  const [sharedError, setSharedError] = useState('');
  const [retryShared, setRetryShared] = useState(0);
  const questionCheckLock = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const [stepState, setStepState] = useState<TeachStepState>(initialStepState);

  // Real microphone recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | undefined>(undefined);
  const [recordedObjectUrl, setRecordedObjectUrl] = useState<string | undefined>(undefined);
  const [recordedDuration, setRecordedDuration] = useState<number>(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  // Playback states
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);

  // Writing states
  const [writtenText, setWrittenText] = useState('');
  const [writingError, setWritingError] = useState<string | null>(null);
  const [savedModeNote, setSavedModeNote] = useState<'complete' | 'voice_only'>('complete');
  const [skipFeedback, setSkipFeedback] = useState<string | null>(null);

  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const stopPlaybackRef = useRef<(() => void) | null>(null);
  const activeObjectUrlRef = useRef<string | undefined>(undefined);
  const writingActionsRef = useRef<HTMLDivElement | null>(null);

  const confirmLeave = () => !isRecording && (!recordedAudioUrl || stepState === 'completed' || window.confirm('Discard this unsaved recording? Save it first to keep it.'));

  const totalQuestions = Math.max(1, questions.length);
  const safeIndex = questions.length > 0 ? questionIndex % questions.length : 0;
  const currentQuestion = questions[safeIndex] || questions[0];

  useEffect(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      try {
        const ids = await fetchAnsweredQuestions();
        if (active) { setAnsweredIds(new Set(ids)); setSharedError(''); }
      } catch (error) { if (active) { setSharedError(String(error)); setAnsweredIds(null); } }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    const reconnect = () => void refresh();
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('focus', reconnect); };
  }, [retryShared]);

  // Sync external step state if controlled in dev preview mode
  useEffect(() => {
    setStepState(initialStepState);
  }, [initialStepState]);

  const updateStep = (next: TeachStepState) => {
    setStepState(next);
    onStepStateChange?.(next);
  };

  const cleanupCurrentObjectUrl = () => {
    if (activeObjectUrlRef.current) {
      revokeAudioObjectUrl(activeObjectUrlRef.current);
      activeObjectUrlRef.current = undefined;
    }
    setRecordedObjectUrl(undefined);
  };

  const [englishSpeed, setEnglishSpeed] = useState<EnglishSpeechSpeed>('normal');
  const [isPlayingEnglish, setIsPlayingEnglish] = useState(false);
  const stopEnglishRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      recorderRef.current?.cancel();
      stopActivePlayback();
      stopEnglishRef.current?.();
      stopEnglishPrompt();
      cleanupCurrentObjectUrl();
    };
  }, []);

  const handlePlayEnglishQuestion = (speedOverride?: EnglishSpeechSpeed) => {
    if (isRecording) return;
    setRecordingError(null);
    const speed = speedOverride || englishSpeed;
    if (stopEnglishRef.current) {
      stopEnglishRef.current();
    }
    stopEnglishRef.current = playEnglishPronunciation(
      currentQuestion.id || currentQuestion.english,
      speed,
      (playing) => setIsPlayingEnglish(playing)
    );
  };

  const handleToggleRecording = async () => {
    setSkipFeedback(null);
    setRecordingError(null);

    if (!isRecording) {
      if (questionCheckLock.current) return;
      questionCheckLock.current = true;
      try {
        const ids = new Set(await fetchAnsweredQuestions());
        setAnsweredIds(ids);
        if (ids.has(currentQuestion.id)) { setRecordingError('Another community member already answered this question. Moving to an unanswered question.'); return; }
      } catch (error) { setSharedError(String(error)); setAnsweredIds(null); return; }
      finally { questionCheckLock.current = false; }
      // Stop any active playback or English question TTS before starting the microphone
      stopActivePlayback();
      stopEnglishRef.current?.();
      stopEnglishPrompt();
      setIsPlayingEnglish(false);
      cleanupCurrentObjectUrl();
      setRecordedAudioUrl(undefined);
      setRecordedDuration(0);

      const recorder = new MicrophoneRecorder();
      recorderRef.current = recorder;

      const startResult = await recorder.start();
      if (!startResult.ok) {
        recorderRef.current = null;
        setIsRecording(false);
        setRecordingError(
          startResult.errorMessage ||
            'Unable to access the microphone. Please check your browser permissions and try again.'
        );
        return;
      }

      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);

      const recorder = recorderRef.current;
      recorderRef.current = null;

      if (recorder) {
        const result = await recorder.stop();
        if (!result.ok || !result.audioDataUrl) {
          cleanupCurrentObjectUrl();
          setRecordedAudioUrl(undefined);
          setRecordedDuration(0);
          setRecordingError(
            result.errorMessage ||
              'No valid voice recording was captured. Please tap the microphone and speak clearly.'
          );
          return;
        }

        activeObjectUrlRef.current = result.objectUrl;
        setRecordedObjectUrl(result.objectUrl);
        setRecordedAudioUrl(result.audioDataUrl);
        setRecordedDuration(result.durationSec);
        setPlaybackSeconds(0);
        setIsPlaying(false);
        updateStep('recorded');

        // Automatically play the recorded voice once without looping
        const sourceToPlay = result.objectUrl || result.audioDataUrl;
        if (sourceToPlay) {
          setIsPlaying(true);
          stopPlaybackRef.current = playAudioRecording(
            sourceToPlay,
            result.durationSec,
            (sec, playing) => {
              setPlaybackSeconds(sec);
              setIsPlaying(playing);
            },
            {
              allowDemoFallback: false,
              onError: (msg) => {
                setIsPlaying(false);
                setRecordingError(msg);
              }
            }
          );
        }
      }
    }
  };

  const handlePlayRecordedAudio = () => {
    const sourceToPlay = recordedObjectUrl || recordedAudioUrl;
    if (!sourceToPlay) {
      setRecordingError('No recorded audio available to play. Please record again.');
      return;
    }

    if (isPlaying) {
      stopActivePlayback();
      setIsPlaying(false);
      return;
    }

    setRecordingError(null);
    stopPlaybackRef.current = playAudioRecording(
      sourceToPlay,
      recordedDuration,
      (sec, playing) => {
        setPlaybackSeconds(sec);
        setIsPlaying(playing);
      },
      {
        allowDemoFallback: false,
        onError: (msg) => {
          setIsPlaying(false);
          setRecordingError(msg);
        }
      }
    );
  };

  const handleRecordAgain = () => {
    if (recordedAudioUrl && stepState !== 'completed' && !window.confirm("Discard this unsaved recording and record again?")) return;
    stopActivePlayback();
    stopEnglishPrompt();
    setIsPlaying(false);
    setPlaybackSeconds(0);
    cleanupCurrentObjectUrl();
    setRecordedAudioUrl(undefined);
    setRecordedDuration(0);
    setRecordingSeconds(0);
    setRecordingError(null);
    updateStep('prompt');
  };

  const handleSaveVoice = async () => {
    stopActivePlayback();
    stopEnglishPrompt();
    setIsPlaying(false);

    if (!recordedAudioUrl || recordedDuration <= 0) {
      setRecordingError('Please record your Edo pronunciation before saving.');
      updateStep('prompt');
      return;
    }

    if (saveLock.current) return;
    saveLock.current = true;
    setIsSaving(true);
    try {
      await onSaveVoiceContribution(currentQuestion.id, recordedAudioUrl, recordedDuration, writtenText.trim(), true);
      setWritingError(null);
      setSavedModeNote(writtenText.trim() ? 'complete' : 'voice_only');
      updateStep('completed');
    } catch (error) { setRecordingError(error instanceof Error ? error.message : 'Unable to save. Please try again.'); }
    finally { saveLock.current = false; setIsSaving(false); }
  };

  const handleSaveWritingAndContinue = async () => {
    const trimmed = writtenText.trim();
    if (!trimmed) {
      setWritingError(
        'Please type the Edo word above, or tap "I can\'t write it (Keep voice & skip)" below.'
      );
      return;
    }
    setWritingError(null);
    try { await onSaveWritingForContribution(currentQuestion.id, trimmed); }
    catch (error) { setWritingError(String(error)); return; }
    setSavedModeNote('complete');
    updateStep('completed');
  };

  const handleCannotWrite = async () => {
    setWritingError(null);
    try { await onSkipWritingKeepVoice(currentQuestion.id); }
    catch (error) { setWritingError(String(error)); return; }
    setSavedModeNote('voice_only');
    updateStep('completed');
  };

  const handleNextWord = (wasSkipped = false) => {
    stopActivePlayback();
    stopEnglishRef.current?.();
    stopEnglishPrompt();
    setIsPlayingEnglish(false);
    setIsPlaying(false);
    setPlaybackSeconds(0);
    cleanupCurrentObjectUrl();
    setRecordedAudioUrl(undefined);
    setRecordedDuration(0);
    setWrittenText('');
    setWritingError(null);
    setRecordingError(null);
    setRecordingSeconds(0);

    if (wasSkipped) {
      setSkipFeedback('No problem! Let’s try another word.');
      window.setTimeout(() => setSkipFeedback(null), 2600);
    } else {
      setSkipFeedback(null);
    }
    setQuestionIndex(prev => {
      const next = (prev + 1) % Math.max(1, questions.length);
      return next;
    });
    updateStep('prompt');
  };

  if (stepState === 'prompt' && !isRecording && !recordedAudioUrl && questions.length === 0) {
    return (
      <div className="edo-screen">
        <StudioHeader theme="green" sectionLabel="Teach Edo" rightAction="close" onRightAction={onFinishForNow} />
        <div className="p-6 text-center space-y-4 my-auto" role="status">
          <div className="w-14 h-14 rounded-full bg-[#E8F5E9] text-[#157A4C] flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-[#1A241D]">Loading more everyday words…</h1>
          <p className="text-sm text-[#556058] max-w-sm mx-auto leading-relaxed">
            You have contributed to all currently available words! The studio is discovering more vocabulary in the background. You can also teach a custom word or phrase of your choice right now.
          </p>
          <div className="pt-2 flex flex-col gap-2.5 max-w-xs mx-auto">
            <button type="button" className="edo-primary-btn" onClick={onOpenTeachSomethingElse}>
              Teach a Custom Word
            </button>
            <button type="button" className="edo-secondary-btn" onClick={onFinishForNow}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="edo-screen">
      {/* Unified Top Studio Header */}
      <StudioHeader
        theme="green"
        sectionLabel="Teach Edo"
        rightAction="close"
        onRightAction={() => { if (confirmLeave()) onFinishForNow(); }}
        onLogoClick={() => { if (confirmLeave()) onFinishForNow(); }}
      />

      {/* Continuous Exploration Sub-header without fixed lesson count */}
      {stepState !== 'completed' && (
        <div className="w-full px-5 pt-1 pb-1.5 shrink-0 flex items-center justify-between text-[13px] text-[#4E5B52] font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#157A4C] animate-pulse" />
            <span>Everyday English → Edo Voice</span>
          </div>
          <button
            type="button"
            onClick={() => { if (confirmLeave()) onOpenTeachSomethingElse(); }}
            className="text-[#157A4C] hover:underline font-bold text-[13px]"
          >
            + Teach custom word
          </button>
        </div>
      )}

      {/* MAIN SINGLE-SCREEN TEACHING BODY */}
      {stepState !== 'completed' ? (
        <div className="edo-screen-scroll">
          {/* Top Word + Illustration Block */}
          <div className="w-full flex flex-col items-center pt-1 my-auto shrink-0">
            {skipFeedback && (
              <div className="mb-1.5 px-3.5 py-1 rounded-full bg-[#E6F4ED] text-[#157A4C] text-[13px] font-semibold">
                {skipFeedback}
              </div>
            )}

            <h1 className="text-[32px] sm:text-[35px] font-bold text-[#18241B] tracking-tight text-center leading-tight">
              {currentQuestion.english}
            </h1>

            <div className="relative w-full flex items-center justify-center mt-2 mb-2 min-h-[140px]">
              <WordIllustration
                id={currentQuestion.id}
                english={currentQuestion.english}
                illustrationKey={currentQuestion.illustrationKey}
                imageUrl={currentQuestion.imageUrl}
                size={stepState === 'writing' ? 'md' : 'lg'}
              />

              {/* English Pronunciation Speaker Button & Speed Controls */}
              {stepState === 'prompt' && (
                <div className="absolute right-1 top-2 flex flex-col items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isRecording}
                    onClick={() => handlePlayEnglishQuestion()}
                    aria-label={`Listen to English pronunciation for ${currentQuestion.english} (${englishSpeed} speed)`}
                    className={`w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-sm transition active:scale-95 disabled:opacity-45 ${
                      isPlayingEnglish
                        ? 'bg-[#157A4C] text-white scale-105'
                        : 'bg-[#E4E9F2] hover:bg-[#D5DFEE] text-[#223458]'
                    }`}
                  >
                    <Volume2 className="w-6 h-6 stroke-[2.3]" />
                  </button>
                  {/* Normal (1x) vs Slow Speed Toggle */}
                  <div className="flex items-center bg-[#E4E9F2]/95 border border-[#D0D9E7] rounded-full p-0.5 shadow-xs">
                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={() => {
                        setEnglishSpeed('normal');
                        handlePlayEnglishQuestion('normal');
                      }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition ${
                        englishSpeed === 'normal'
                          ? 'bg-[#223458] text-white shadow-xs'
                          : 'text-[#4A5872] hover:text-[#223458]'
                      }`}
                      title="Normal speed (Kokoro British English)"
                    >
                      1x
                    </button>
                    <button
                      type="button"
                      disabled={isRecording}
                      onClick={() => {
                        setEnglishSpeed('slow');
                        handlePlayEnglishQuestion('slow');
                      }}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold transition ${
                        englishSpeed === 'slow'
                          ? 'bg-[#223458] text-white shadow-xs'
                          : 'text-[#4A5872] hover:text-[#223458]'
                      }`}
                      title="Slow speed (Deliberate Kokoro pronunciation)"
                    >
                      Slow
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STATE 3: INITIAL PROMPT & RECORDING ON ONE SCREEN */}
          {stepState === 'prompt' && (
            <div className="w-full flex flex-col items-center justify-between gap-3.5 my-auto pt-1">
              <div className="w-full flex flex-col items-center">
                <p className="text-[20px] font-bold text-[#1E2B22] text-center mb-3">
                  How do you say this in Edo?
                </p>

                {/* Clear Error Banner for Permission Denial, Silent Mic, or Recording Error */}
                {recordingError && (
                  <div
                    role="alert"
                    className="w-full mb-3 px-3.5 py-2.5 rounded-2xl bg-[#FDF2F0] border border-[#F3C5BE] text-[#9E2A1C] text-[13px] font-semibold flex items-start gap-2.5 shadow-sm"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B2B]" />
                    <span className="leading-snug text-left">{recordingError}</span>
                  </div>
                )}

                {/* Prominent Centered Green Microphone Button */}
                <div className="relative flex items-center justify-center my-0.5">
                  {isRecording && (
                    <span className="absolute w-32 h-32 rounded-full bg-[#157A4C]/25 animate-ping" />
                  )}
                  <button
                    type="button"
                    onClick={handleToggleRecording}
                    aria-label={isRecording ? 'Stop recording' : 'Start recording Edo translation'}
                    className={`relative z-10 w-[96px] h-[96px] rounded-full flex items-center justify-center shadow-lg border-4 transition-all ${
                      isRecording
                        ? 'bg-[#C93B2B] border-[#F8D7D3] scale-105'
                        : 'bg-[#1F8A58] hover:bg-[#157A4C] border-[#D7EFE2] active:scale-95'
                    }`}
                  >
                    {isRecording ? (
                      <Square className="w-9 h-9 text-white fill-white" />
                    ) : (
                      <Mic className="w-11 h-11 text-white stroke-[2.3]" />
                    )}
                  </button>
                </div>

                <p className="mt-2.5 text-[15px] font-bold text-[#2B372E]">
                  {isRecording
                    ? `Recording... ${formatDuration(recordingSeconds)} (Tap to stop)`
                    : 'Tap to record (or tap & hold)'}
                </p>
              </div>

              {/* I don't know — Next word */}
              <button
                type="button"
                disabled={isRecording}
                onClick={() => handleNextWord(true)}
                className="w-full min-h-[56px] mt-1 py-2.5 px-5 rounded-2xl bg-white hover:bg-[#F5F1E6] border border-[#DDD5C4] text-[#222D25] shadow-sm flex flex-col items-center justify-center transition disabled:opacity-50"
              >
                <span className="text-[16.5px] font-bold leading-tight">
                  I don&apos;t know
                </span>
                <span className="text-[12.5px] font-semibold text-[#556158] flex items-center gap-1 mt-0.5">
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
          )}

          {/* STATE 4: VOICE RECORDED — PLAYBACK, RECORD AGAIN, OR SAVE VOICE */}
          {stepState === 'recorded' && (
            <div className="w-full flex flex-col justify-between gap-3.5 my-auto pt-1">
              {recordingError && (
                <div
                  role="alert"
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#FDF2F0] border border-[#F3C5BE] text-[#9E2A1C] text-[13px] font-semibold flex items-start gap-2.5 shadow-sm"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B2B]" />
                  <span className="leading-snug text-left">{recordingError}</span>
                </div>
              )}

              {/* Green Audio Player Box with Waveform */}
              <div className="w-full rounded-2xl bg-[#E5F4EC] border border-[#BEE2CE] px-4 py-3.5 flex items-center gap-3.5 shadow-sm">
                <button
                  type="button"
                  onClick={handlePlayRecordedAudio}
                  aria-label={isPlaying ? 'Pause recording playback' : 'Listen to recording'}
                  className="w-12 h-12 rounded-full bg-[#157A4C] hover:bg-[#10623D] text-white flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-white" />
                  ) : (
                    <Play className="w-5 h-5 fill-white ml-0.5" />
                  )}
                </button>

                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center justify-between gap-[3px] h-8 px-1">
                    {[35, 65, 45, 85, 55, 95, 70, 40, 80, 60, 90, 50, 75, 45, 85, 65, 40, 55].map(
                      (heightPct, idx) => (
                        <span
                          key={idx}
                          style={{ height: `${heightPct}%` }}
                          className={`w-1 rounded-full transition-all ${
                            isPlaying
                              ? 'bg-[#157A4C] animate-pulse'
                              : 'bg-[#259662]/75'
                          }`}
                        />
                      )
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] font-bold text-[#1B5E3E] mt-1.5">
                    <span className="truncate">
                      {isPlaying ? 'Playing your Edo voice...' : 'Tap Play to listen'}
                    </span>
                    <span className="shrink-0 ml-2">
                      {formatDuration(playbackSeconds)} / {formatDuration(recordedDuration)}
                    </span>
                  </div>
                </div>
              </div>

              <label className="text-sm font-semibold" htmlFor="recorded-edo-text">Edo translation (optional)</label>
              <input id="recorded-edo-text" className="edo-input" value={writtenText} onChange={event => setWrittenText(event.target.value)} placeholder="Type Edo translation, or leave empty" />
              <div className="w-full flex flex-col gap-2.5 pt-0.5">
                {/* Record Again Button */}
                <button
                  type="button"
                  onClick={handleRecordAgain}
                  className="edo-secondary-btn"
                >
                  <Trash2 className="w-4 h-4 text-[#5A655D]" />
                  <span>Record again</span>
                </button>

                <p className="text-[11.5px] text-[#556058] text-center leading-relaxed px-2">
                  By submitting your recording, you agree to share it for listening in the Edo Language Studio Library. Your voice will not be used for AI training.
                </p>

                {/* Save Voice / Save and Continue Button */}
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleSaveVoice}
                  className="edo-primary-btn bg-[#157A4C] hover:bg-[#11663F] text-white"
                >
                  <span>{isSaving ? 'Saving…' : 'Save Voice & Continue'}</span>
                  <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>
          )}

          {/* STATE 5: WRITE THE WORD (REFERENCE PROPORTIONS + KEYBOARD-SAFE SCROLL) */}
          {stepState === 'writing' && (
            <div
              ref={writingActionsRef}
              className="w-full flex flex-col justify-between gap-3 my-auto pt-0.5"
            >
              <div className="w-full flex flex-col gap-2.5">
                {/* Green Voice Saved Confirmation Banner */}
                <div className="w-full rounded-2xl bg-[#E5F4EC] border border-[#BEE2CE] px-3.5 py-2.5 flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#157A4C] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                  </div>
                  <div className="text-left">
                    <p className="text-[15.5px] font-bold text-[#135E3B] leading-snug">
                      Voice saved!
                    </p>
                    <p className="text-[14px] text-[#234836] font-medium leading-snug">
                      Thank you! Can you also write &ldquo;{currentQuestion.english}&rdquo; in Edo?
                    </p>
                  </div>
                </div>

                {writingError && (
                  <div
                    role="alert"
                    className="w-full px-3.5 py-2 rounded-2xl bg-[#FDF2F0] border border-[#F3C5BE] text-[#9E2A1C] text-[12.5px] font-semibold flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#C93B2B]" />
                    <span className="leading-snug text-left">{writingError}</span>
                  </div>
                )}

                {/* Text Input for Edo Spelling */}
                <div className="w-full">
                  <input
                    type="text"
                    value={writtenText}
                    onChange={(e) => {
                      setWrittenText(e.target.value);
                      if (writingError) setWritingError(null);
                    }}
                    onFocus={() => {
                      window.setTimeout(() => {
                        writingActionsRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'nearest'
                        });
                      }, 150);
                    }}
                    placeholder="Type the Edo word here..."
                    className="edo-input focus:border-[#157A4C] focus:ring-2 focus:ring-[#157A4C]/20"
                  />

                  {/* Helpful Edo characters bar */}
                  <div className="flex items-center justify-between gap-1 mt-2">
                    <span className="text-[11.5px] text-[#5E6A62] font-semibold shrink-0">
                      Edo letters:
                    </span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {EDO_SPECIAL_CHARS.map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => {
                            setWrittenText((prev) => prev + ch);
                            if (writingError) setWritingError(null);
                          }}
                          className="px-2 py-0.5 rounded-md bg-[#EFE9DA] hover:bg-[#E2D9C3] text-[#253028] text-[12px] font-bold transition shrink-0"
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full flex flex-col gap-2.5 pt-0.5">
                {/* Save and Continue */}
                <button
                  type="button"
                  onClick={handleSaveWritingAndContinue}
                  className="edo-primary-btn bg-[#157A4C] hover:bg-[#11663F] text-white"
                >
                  <span>Save and continue</span>
                  <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                </button>

                {/* I can't write it — Preserves Voice-Only Contribution as Needs Writing */}
                <button
                  type="button"
                  onClick={handleCannotWrite}
                  className="edo-secondary-btn"
                >
                  <span>I can&apos;t write it (Keep voice &amp; skip)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* STATE 6: THANK YOU COMPLETION STATE ON THE SAME SCREEN */
        <div className="edo-screen-scroll text-center">
          <div className="flex flex-col items-center my-auto py-3">
            <div className="relative flex items-center justify-center mb-4">
              <div className="w-24 h-24 rounded-full bg-[#E5F4EC] flex items-center justify-center">
                <div className="w-18 h-18 p-4 rounded-full bg-[#157A4C] text-white flex items-center justify-center shadow-md">
                  <Check className="w-10 h-10 stroke-[3]" />
                </div>
              </div>
              <Sparkles className="w-6 h-6 text-[#F4C330] absolute -top-1 -right-2" />
              <CheckCircle2 className="w-5 h-5 text-[#157A4C] absolute bottom-1 -left-2" />
            </div>

            <h2 className="text-[29px] font-bold text-[#18241B] tracking-tight">
              Thank you for teaching me!
            </h2>

            <p className="mt-2 text-[15.5px] leading-relaxed text-[#424E45] font-medium max-w-[280px]">
              Your contribution is saved and will help me learn Edo better.
            </p>

            <div className="mt-3.5 px-4 py-1.5 rounded-2xl bg-[#E6F4ED] border border-[#C2E2D0] text-[#146940] text-[12.5px] font-bold">
              {savedModeNote === 'complete'
                ? `Saved "${currentQuestion.english}" with voice & Edo writing`
                : `Voice saved for "${currentQuestion.english}" • Marked "Needs Writing"`}
            </div>
          </div>

          <div className="w-full flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleNextWord(false)}
              className="edo-primary-btn bg-[#157A4C] hover:bg-[#11663F] text-white"
            >
              <span>Next word</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </button>

            <button
              type="button"
              onClick={() => { if (confirmLeave()) onOpenTeachSomethingElse(); }}
              className="w-full min-h-[50px] py-2.5 px-5 rounded-2xl bg-[#E6F4ED] hover:bg-[#D5ECE0] border border-[#B9DFCA] text-[#157A4C] font-bold text-[15.5px] transition"
            >
              Teach Something Else
            </button>

            <button
              type="button"
              onClick={onFinishForNow}
              className="edo-secondary-btn"
            >
              <span>Finish for now</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
