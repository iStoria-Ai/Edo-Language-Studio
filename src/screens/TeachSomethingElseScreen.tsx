import React, { useState, useRef, useEffect } from 'react';
import {
  MessageCircle,
  Mic,
  Square,
  Send,
  Play,
  Pause,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { StudioHeader } from '../components/StudioHeader';
import { EdoLetterBar } from '../components/EdoLetterBar';
import {
  MicrophoneRecorder,
  playAudioRecording,
  stopActivePlayback,
  formatDuration
} from '../services/audioService';

interface TeachSomethingElseScreenProps {
  onSaveCustomContribution: (params: {
    englishText: string;
    edoText: string;
    audioDataUrl?: string;
    audioDurationSec?: number;
    playbackAllowed?: boolean;
  }) => Promise<void>;
  onClose: () => void;
}

const EDO_SPECIAL_CHARS = ['ẹ', 'ọ', 'vb', 'gh', 'kh', 'mw', 'rh'];

export const TeachSomethingElseScreen: React.FC<TeachSomethingElseScreenProps> = ({
  onSaveCustomContribution,
  onClose
}) => {
  const [englishOrMainText, setEnglishOrMainText] = useState('');
  const [optionalEdoSpelling, setOptionalEdoSpelling] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [audioDataUrl, setAudioDataUrl] = useState<string | undefined>(undefined);
  const [audioDuration, setAudioDuration] = useState(3);
  const [isPlaying, setIsPlaying] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const recorderRef = useRef<MicrophoneRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const edoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopActivePlayback();
    };
  }, []);

  const handleToggleMic = async () => {
    setSavedNotice(null);
    if (!isRecording) {
      stopActivePlayback();
      const recorder = new MicrophoneRecorder();
      recorderRef.current = recorder;
      const startRes = await recorder.start();
      if (!startRes.ok) {
        recorderRef.current = null;
        setSavedNotice(
          startRes.errorMessage || 'Microphone access was denied. Please check permissions.'
        );
        return;
      }
      setIsRecording(true);
      setRecordingSec(0);
      timerRef.current = window.setInterval(() => {
        setRecordingSec((s) => s + 1);
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
          setAudioDataUrl(undefined);
          setSavedNotice(
            res.errorMessage || 'No voice detected. Please speak clearly and record again.'
          );
          return;
        }
        setAudioDataUrl(res.audioDataUrl);
        setAudioDuration(res.durationSec);

        // Automatically play the recorded voice once without looping
        setIsPlaying(true);
        playAudioRecording(
          res.audioDataUrl,
          res.durationSec,
          (_sec, playing) => {
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

  const handleTogglePlayback = () => {
    if (!audioDataUrl) return;
    if (isPlaying) {
      stopActivePlayback();
      setIsPlaying(false);
      return;
    }
    playAudioRecording(audioDataUrl, audioDuration, (_sec, playing) => {
      setIsPlaying(playing);
    });
  };

  const handleSendContribution = async () => {
    const trimmedMain = englishOrMainText.trim();
    const trimmedEdo = optionalEdoSpelling.trim();

    if (!trimmedMain && !trimmedEdo && !audioDataUrl) {
      setSavedNotice('Please type a word/phrase or record a voice contribution first.');
      return;
    }

    stopActivePlayback();
    setIsPlaying(false);

    try { await onSaveCustomContribution({
      englishText: trimmedMain || 'Community spoken phrase',
      edoText: trimmedEdo,
      audioDataUrl,
      audioDurationSec: audioDataUrl ? audioDuration : undefined,
      playbackAllowed: true
    }); } catch (error) { setSavedNotice(String(error)); return; }

    const statusMsg =
      audioDataUrl && trimmedEdo
        ? 'Saved with both Edo writing and voice!'
        : audioDataUrl && !trimmedEdo
        ? 'Voice saved! Added to "Help Others" so someone can write the Edo spelling.'
        : 'Written phrase saved! Added to "Help Others" so someone can record the pronunciation.';

    setSavedNotice(statusMsg);
    setEnglishOrMainText('');
    setOptionalEdoSpelling('');
    setAudioDataUrl(undefined);
    setRecordingSec(0);
  };

  return (
    <div className="edo-screen">
      {/* Unified Studio Header (Green Section) */}
      <StudioHeader
        theme="green"
        sectionLabel="Teach Something Else"
        rightAction="close"
        onRightAction={onClose}
        onLogoClick={onClose}
      />

      {/* Main Content (px-5 matching Write the Word) */}
      <div className="edo-screen-scroll pt-1">
        <div className="flex flex-col gap-3.5 my-auto">
          {/* Prompt Card */}
          <div className="w-full rounded-2xl bg-[#F2EFFA] border border-[#DFD8F2] p-4 flex items-center gap-3.5 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-white text-[#1C241E] flex items-center justify-center shrink-0 shadow-sm">
              <MessageCircle className="w-7 h-7 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-[19px] font-bold text-[#18241B] leading-snug">
                What would you like to teach me in Edo?
              </h1>
              <p className="text-[13.5px] text-[#4C564F] font-medium mt-1 leading-snug">
                You can teach a new word, phrase or sentence.
              </p>
            </div>
          </div>

          {savedNotice && (
            <div className="px-4 py-3 rounded-2xl bg-[#E5F4EC] border border-[#B9DFCA] text-[#125C39] text-[13.5px] font-bold flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#157A4C]" />
              <span>{savedNotice}</span>
            </div>
          )}

          {/* Text Inputs */}
          <div className="space-y-2.5">
            <input
              type="text"
              value={englishOrMainText}
              onChange={(e) => setEnglishOrMainText(e.target.value)}
              placeholder="Type in English or Edo..."
              className="edo-input focus:border-[#157A4C] focus:ring-2 focus:ring-[#157A4C]/20"
            />

            <input
              type="text"
              ref={edoInputRef}
              value={optionalEdoSpelling}
              onChange={(e) => setOptionalEdoSpelling(e.target.value)}
              placeholder="Optional: Edo spelling (if you know it)..."
              className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-white/95 border border-[#DFD7C5] text-[16px] text-[#1C241E] placeholder-[#8C948E] focus:outline-none focus:border-[#157A4C]"
            />

            {/* Quick Edo letters with cursor insertion */}
            <EdoLetterBar
              inputRef={edoInputRef}
              value={optionalEdoSpelling}
              onChange={setOptionalEdoSpelling}
              className="pt-0.5"
            />
          </div>

          {/* Playback Preview Bar (when voice recorded) */}
          {audioDataUrl && (
            <div className="w-full rounded-2xl bg-[#E5F4EC] border border-[#BEE2CE] px-3.5 py-2.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleTogglePlayback}
                className="flex items-center gap-2 text-[#157A4C] font-bold text-[14px]"
              >
                <span className="w-9 h-9 rounded-full bg-[#157A4C] text-white flex items-center justify-center">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </span>
                <span>Replay recorded voice ({formatDuration(audioDuration)})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopActivePlayback();
                  setAudioDataUrl(undefined);
                }}
                className="p-1.5 text-[#5A655D] hover:text-[#B91C1C]"
                title="Remove recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {audioDataUrl && (
          <p className="text-[11.5px] text-[#556058] text-center leading-relaxed mt-2.5 px-2">
            By submitting your recording, you agree to share it for listening in the Edo Language Studio Library. Your voice will not be used for AI training.
          </p>
        )}
        {/* Bottom Microphone + Send Layout */}
        <div className="pt-3">
          <div className="text-center text-[14px] font-bold text-[#525E55] mb-2.5">
            or record voice &amp; send
          </div>

          <div className="flex items-center justify-between gap-4 px-1">
            {/* Left Large Green Microphone */}
            <div className="flex flex-col items-center shrink-0">
              <button
                type="button"
                onClick={handleToggleMic}
                className={`w-[88px] h-[88px] rounded-full flex items-center justify-center shadow-lg border-4 transition ${
                  isRecording
                    ? 'bg-[#C93B2B] border-[#F8D7D3] animate-pulse'
                    : 'bg-[#1F8A58] hover:bg-[#157A4C] border-[#D7EFE2] active:scale-95'
                }`}
              >
                {isRecording ? (
                  <Square className="w-8 h-8 text-white fill-white" />
                ) : (
                  <Mic className="w-10 h-10 text-white stroke-[2.3]" />
                )}
              </button>
              <span className="text-[13px] font-bold text-[#2E3A31] mt-1.5 text-center">
                {isRecording
                  ? `Recording ${formatDuration(recordingSec)}`
                  : 'Tap to record'}
              </span>
            </div>

            {/* Right Send Button */}
            <button
              type="button"
              onClick={handleSendContribution}
              className="flex-1 min-h-[60px] py-4 px-5 rounded-2xl bg-[#157A4C] hover:bg-[#11663F] text-white font-bold text-[18.5px] flex items-center justify-center gap-2.5 shadow-md transition-all active:scale-95"
            >
              <Send className="w-5 h-5 stroke-[2.4]" />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
