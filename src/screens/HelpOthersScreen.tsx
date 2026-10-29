import React, { useState, useRef, useEffect } from 'react';
import {
  Headphones,
  Play,
  Pause,
  ArrowRight,
  Mic,
  Square,
  FileEdit,
  CheckCircle2
} from 'lucide-react';
import { getCommunityAudio } from '../services/communityLibrary';
import { EdoEntry } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';
import {
  playAudioRecording,
  stopActivePlayback,
  formatDuration,
  MicrophoneRecorder
} from '../services/audioService';

interface HelpOthersScreenProps {
  entries: EdoEntry[];
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
  onAttachWritingToEntry,
  onAttachAudioToEntry,
  onBackToDashboard
}) => {
  const [helpMode, setHelpMode] = useState<'write' | 'record'>('write');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [writtenAnswer, setWrittenAnswer] = useState('');
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSec, setPlaybackSec] = useState(0);

  // Audio recording state (for "Needs Voice" mode)
  const [playbackAllowed, setPlaybackAllowed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const [capturedAudioUrl, setCapturedAudioUrl] = useState<string | undefined>(undefined);
  const [capturedDuration, setCapturedDuration] = useState(3);

  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const needsWritingList = entries.filter((e) => {
    if (e.isSampleData) return false;
    const hasVoice = Boolean((e.hasAudio && !e.isSampleData) || e.cloudAudioFileId || (e.audioDataUrl && !e.isSampleData));
    if (!hasVoice) return false;
    const hasSpelling = Boolean(e.edoText && e.edoText.trim().length > 0);
    return !hasSpelling && (!e.isCommunity || e.playbackPermission === 'granted');
  });
  const needsAudioList = entries.filter((e) => {
    if (e.isSampleData) return false;
    const hasSpelling = Boolean(e.edoText && e.edoText.trim().length > 0);
    if (!hasSpelling) return false;
    const hasVoice = Boolean((e.hasAudio && !e.isSampleData) || e.cloudAudioFileId || (e.audioDataUrl && !e.isSampleData));
    return !hasVoice;
  });

  const activeList = helpMode === 'write' ? needsWritingList : needsAudioList;
  const currentItem = activeList[currentIndex % Math.max(1, activeList.length)];

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopActivePlayback();
    };
  }, []);

  const showTransientMessage = (msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => setFeedbackBanner(null), 2800);
  };

  const handlePlayExistingAudio = async () => {
    if (!currentItem) return;
    if (isPlaying) {
      stopActivePlayback();
      setIsPlaying(false);
      return;
    }
    const duration = currentItem.audioDurationSec || 4;
    let audio: string;
    try { audio = currentItem.audioDataUrl || await getCommunityAudio(currentItem); }
    catch (error) { showTransientMessage(String(error)); return; }
    playAudioRecording(audio, duration, (sec, playing) => {
      setPlaybackSec(sec);
      setIsPlaying(playing);
    });
  };

  const handleSaveWriting = async () => {
    if (!currentItem) return;
    const trimmed = writtenAnswer.trim();
    if (!trimmed) {
      showTransientMessage('Please type the Edo writing or tap "Skip this" if unsure.');
      return;
    }
    stopActivePlayback();
    setIsPlaying(false);
    try { await onAttachWritingToEntry(currentItem.id, trimmed); }
    catch (error) { showTransientMessage(String(error)); return; }
    setWrittenAnswer('');
    showTransientMessage(`Edo writing saved for "${currentItem.english}". Contribution completed and moved to the Library.`);
    setCurrentIndex(0);
  };

  const handleSkipItem = () => {
    stopActivePlayback();
    setIsPlaying(false);
    setWrittenAnswer('');
    setCapturedAudioUrl(undefined);
    showTransientMessage('Thank you! Here is another unfinished contribution.');
    setCurrentIndex((prev) => prev + 1);
  };

  const handleToggleRecordForWrittenEntry = async () => {
    if (!isRecording) {
      stopActivePlayback();
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
    if (!currentItem || !capturedAudioUrl) return;
    stopActivePlayback();
    setIsPlaying(false);
    await onAttachAudioToEntry(currentItem.id, capturedAudioUrl, capturedDuration, playbackAllowed);
    setCapturedAudioUrl(undefined);
    showTransientMessage(`Thank you! Added Edo voice recording for "${currentItem.english}".`);
    setCurrentIndex(0);
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
              All caught up in this queue!
            </h2>
            <p className="text-[15px] text-[#556058] mt-1.5">
              Switch tabs above or teach a new word in Teach Edo.
            </p>
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

              {/* English Phrase / Word */}
              <div className="pt-0.5">
                <p className="text-[21px] font-bold text-[#1A241D]">
                  English: <span className="text-[#18241B]">{currentItem.english}</span>
                </p>
              </div>

              {/* Blue Audio Playback Card for Existing Recording */}
              <div className="w-full rounded-2xl bg-[#E6EFFC] border border-[#C3D9FA] px-4 py-4 flex items-center gap-3.5 shadow-sm">
                <button
                  type="button"
                  onClick={handlePlayExistingAudio}
                  aria-label="Play existing Edo recording"
                  className="w-12 h-12 rounded-full bg-[#1D6CE0] hover:bg-[#1558BD] text-white flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition"
                >
                  {isPlaying ? (
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
                          isPlaying ? 'bg-[#1D6CE0] animate-pulse' : 'bg-[#3B82F6]/80'
                        }`}
                      />
                    )
                  )}
                </div>

                <span className="text-[13px] font-bold text-[#1E3A68] shrink-0">
                  {formatDuration(playbackSec)} / {formatDuration(currentItem.audioDurationSec || 4)}
                </span>
              </div>

              {/* Writing Question & Text Box */}
              <div className="pt-1">
                <label className="block text-[18.5px] font-bold text-[#1C241E] mb-2">
                  Can you write this in Edo?
                </label>
                <input
                  type="text"
                  value={writtenAnswer}
                  onChange={(e) => setWrittenAnswer(e.target.value)}
                  placeholder="Type the Edo words you hear..."
                  className="edo-input focus:border-[#1D6CE0] focus:ring-2 focus:ring-[#1D6CE0]/20"
                />

                {/* Quick Edo letters */}
                <div className="flex items-center justify-between gap-1 mt-2">
                  <span className="text-[11.5px] text-[#5E6A62] font-semibold shrink-0">
                    Edo letters:
                  </span>
                  <div className="flex items-center gap-1 flex-wrap justify-end">
                    {EDO_SPECIAL_CHARS.map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        onClick={() => setWrittenAnswer((prev) => prev + ch)}
                        className="px-2 py-0.5 rounded-md bg-[#EFE9DA] hover:bg-[#E2D9C3] text-[#253028] text-[12px] font-bold transition shrink-0"
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleSaveWriting}
                className="edo-primary-btn bg-[#157A4C] hover:bg-[#11663F] text-white"
              >
                <span>Save and continue</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={handleSkipItem}
                className="edo-secondary-btn"
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

              <div className="rounded-2xl bg-white border border-[#E2DAC7] p-4 text-center shadow-sm">
                <span className="text-4xl block mb-1.5">{currentItem.emoji}</span>
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
              <label className="flex items-start gap-2 text-sm leading-snug"><input type="checkbox" checked={playbackAllowed} onChange={event => setPlaybackAllowed(event.target.checked)} />I am the speaker and permit shared-library playback. AI voice training is not granted.</label>
                  <button
                type="button"
                disabled={!capturedAudioUrl}
                onClick={handleSaveRecordedAudioForWrittenEntry}
                className="edo-primary-btn bg-[#1D6CE0] hover:bg-[#1658B8] disabled:opacity-45 text-white"
              >
                <span>Save Pronunciation</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5]" />
              </button>

              <button
                type="button"
                onClick={handleSkipItem}
                className="edo-secondary-btn"
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
