import React, { useState, useEffect } from 'react';
import {
  Search,
  Volume2,
  AlertCircle,
  X,
  Play,
  Mic,
  FileEdit,
  Info
} from 'lucide-react';
import { lessonProgress } from '../services/storageService';
import { LibraryBackupTools } from '../components/LibraryBackupTools';
import { RecordingInformation } from '../components/RecordingInformation';
import { ProtectedRecording } from '../services/libraryProtection';
import { EdoEntry } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';
import { WordIllustration } from '../components/WordIllustration';
import { playAudioRecording, stopActivePlayback, speakEnglishPrompt, stopEnglishPrompt } from '../services/audioService';

interface LanguageLibraryScreenProps {
  entries: EdoEntry[];
  recordings: ProtectedRecording[];
  queueCount: number;
  onLibraryChanged: () => Promise<void>;
  onEditText: (id: string, text: string) => Promise<void>;
  onDeleteLesson: (id: string) => Promise<void>;
  onBackToDashboard: () => void;
  onJumpToHelpOthers: () => void;
}

type LibraryFilter = 'all' | 'words' | 'phrases' | 'missing';

export const LanguageLibraryScreen: React.FC<LanguageLibraryScreenProps> = ({
  entries,
  recordings,
  queueCount,
  onLibraryChanged,
  onEditText,
  onDeleteLesson,
  onBackToDashboard,
  onJumpToHelpOthers
}) => {
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => stopActivePlayback(), []);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<EdoEntry | null>(null);

  useEffect(() => {
    return () => {
      stopActivePlayback();
      stopEnglishPrompt();
    };
  }, []);

  const visibleEntries = entries.filter((entry) => {
    if (entry.status === 'unanswered') {
      if (activeFilter !== 'missing') return false;
    }
    if (activeFilter === 'words' && entry.category !== 'word') return false;
    if (
      activeFilter === 'phrases' &&
      entry.category !== 'phrase' &&
      entry.category !== 'sentence'
    ) {
      return false;
    }
    if (
      activeFilter === 'missing' &&
      entry.status !== 'needs_writing' &&
      entry.status !== 'needs_audio' &&
      entry.status !== 'unanswered'
    ) {
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

  const handlePlayWordAudio = (e: React.MouseEvent, entry: EdoEntry) => {
    e.stopPropagation();
    if (!entry.hasAudio) return;

    if (playingId === entry.id) {
      stopActivePlayback();
      setPlayingId(null);
      return;
    }

    setPlayingId(entry.id);
    playAudioRecording(entry.audioDataUrl, entry.audioDurationSec || 3, (_sec, playing) => {
      if (!playing) {
        setPlayingId(null);
      }
    }, { allowDemoFallback: entry.isSampleData, onError: message => { setPlayingId(null); setError(message); } });
  };

  return (
    <div className="edo-screen relative">
      {/* Unified Studio Header (Yellow Section) */}
      <StudioHeader
        theme="yellow"
        sectionLabel="Language Library"
        rightAction="close"
        onRightAction={onBackToDashboard}
        onLogoClick={onBackToDashboard}
      />

      <p className="px-5 text-sm text-[#157A4C]" role="status">{lessonProgress(entries).completed} completed lessons · {lessonProgress(entries).waiting} questions waiting</p>
      {error && <p role="alert" className="px-5 text-red-700">{error}</p>}
      <LibraryBackupTools queueCount={queueCount} recordingCount={recordings.length} onLibraryChanged={onLibraryChanged} />
      {/* Search Bar & Filter Pills (px-5) */}
      <div className="w-full px-5 pt-1 pb-2.5 shrink-0">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#7C857E] absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search words or phrases..."
            className="w-full min-h-[48px] pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-[#DED6C4] text-[16px] text-[#1C241E] placeholder-[#89918B] focus:outline-none focus:border-[#D4A318] shadow-sm"
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

        {/* Filter Pills: All / Words / Phrases / Missing */}
        <div className="flex items-center gap-2 mt-2.5 overflow-x-auto pb-0.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'words', label: 'Words' },
              { id: 'phrases', label: 'Phrases' },
              { id: 'missing', label: 'Missing' }
            ] as { id: LibraryFilter; label: string }[]
          ).map((tab) => {
            const isActive = activeFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-4 py-1.5 rounded-full text-[13.5px] font-bold transition shrink-0 ${
                  isActive
                    ? 'bg-[#157A4C] text-white shadow-sm'
                    : 'bg-white border border-[#DFD7C5] text-[#333F36] hover:bg-[#F3EDE0]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Sample Data Notice */}
        <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-[#FEF6DA] border border-[#EAD07C] flex items-center gap-2 text-[11.5px] text-[#5C4500] font-medium">
          <Info className="w-3.5 h-3.5 shrink-0 text-[#9B7400]" />
          <span>
            Entries marked <strong>Sample</strong> are demonstration placeholders until community verification is complete.
          </span>
        </div>
      </div>

      {/* Word Cards List (px-5) */}
      <div className="w-full px-5 pb-5 flex-1 overflow-y-auto space-y-2.5 min-h-0">
        {visibleEntries.map((entry) => {
          const isPlayingThis = playingId === entry.id;
          return (
            <div
              key={entry.id}
              onClick={() => { setSelectedEntry(entry); setEditText(entry.edoText || ''); setError(null); }}
              className="w-full rounded-2xl bg-white hover:bg-[#FCF9F2] border border-[#E6DFCF] px-4 py-3 flex items-center justify-between gap-3 shadow-sm cursor-pointer transition"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#FAF6EC] flex items-center justify-center shrink-0">
                  <WordIllustration
                    illustrationKey={entry.illustrationKey}
                    emoji={entry.emoji}
                    size="sm"
                  />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-[17.5px] font-bold text-[#1A241D] truncate">
                      {entry.english}
                    </h3>
                    {entry.isSampleData ? (
                      <span className="px-1.5 py-0.5 rounded bg-[#F3EDE0] text-[#665C43] text-[10px] font-bold uppercase tracking-wider shrink-0">
                        Sample
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-[#E6F4ED] text-[#157A4C] text-[10px] font-bold uppercase tracking-wider shrink-0">
                        Local
                      </span>
                    )}
                  </div>

                  {entry.edoText ? (
                    <p className="text-[14.5px] text-[#4E5A52] font-medium truncate">
                      Edo: <span className="font-bold text-[#232E26]">{entry.edoText}</span>
                    </p>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[#1D6CE0]">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Needs Edo writing
                    </span>
                  )}
                </div>
              </div>

              {/* Right Speaker or Missing Audio Badge */}
              <div className="shrink-0">
                {entry.hasAudio ? (
                  <button
                    type="button"
                    onClick={(e) => handlePlayWordAudio(e, entry)}
                    aria-label={`${isPlayingThis ? 'Stop' : 'Play'} pronunciation for ${entry.english}`}
                    className={`w-11 h-11 rounded-full flex items-center justify-center transition ${
                      isPlayingThis
                        ? 'bg-[#157A4C] text-white scale-105'
                        : 'bg-[#E5F4EC] hover:bg-[#D2ECDF] text-[#157A4C]'
                    }`}
                  >
                    <Volume2 className="w-5 h-5 stroke-[2.3]" />
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[#92400E] text-[11.5px] font-bold">
                    Needs Voice
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {visibleEntries.length === 0 && (
          <div className="py-10 text-center text-[#5A655D] text-[15px]">
            No words found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </div>

      {/* Word Details Bottom Sheet / Modal */}
      {selectedEntry && (
        <div
          onClick={() => setSelectedEntry(null)}
          className="absolute inset-0 bg-black/40 z-20 flex items-end justify-center p-3"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-h-[90%] overflow-y-auto rounded-3xl bg-[#FAF7F0] border border-[#E0D8C6] p-5 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white border border-[#E5DEC9] flex items-center justify-center">
                  <WordIllustration
                    illustrationKey={selectedEntry.illustrationKey}
                    emoji={selectedEntry.emoji}
                    size="sm"
                  />
                </div>
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A5900] bg-[#FEF4CE] px-2 py-0.5 rounded">
                    {selectedEntry.isSampleData
                      ? 'Sample Prototype Entry'
                      : 'Local Community Contribution'}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h3 className="text-[22px] font-bold text-[#18241B]">
                      {selectedEntry.english}
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        stopActivePlayback();
                        speakEnglishPrompt(selectedEntry.english, false);
                      }}
                      aria-label={`Listen to English pronunciation for ${selectedEntry.english}`}
                      title="Listen to English pronunciation"
                      className="w-8 h-8 rounded-full bg-[#E4E9F2] hover:bg-[#D5DFEE] active:scale-95 text-[#223458] flex items-center justify-center shadow-sm transition shrink-0"
                    >
                      <Volume2 className="w-4 h-4 stroke-[2.2]" />
                    </button>
                  </div>
                  <p className="text-[15.5px] font-bold text-[#157A4C]">
                    {selectedEntry.edoText
                      ? `Edo: ${selectedEntry.edoText}`
                      : 'Edo spelling needed'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="w-9 h-9 rounded-full bg-[#EFE9DA] flex items-center justify-center text-[#3A453D]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedEntry.notes && (
              <p className="mt-3 text-[13px] text-[#56625A] bg-white rounded-xl p-3 border border-[#E6DFCF]">
                {selectedEntry.notes}
              </p>
            )}

            <p className="mt-3 text-xs text-[#56625A]">Lesson ID: {selectedEntry.id}<br />Created: {new Date(selectedEntry.createdAt || selectedEntry.updatedAt).toLocaleDateString()}</p>
            {selectedEntry.recordingId && recordings.find(recording => recording.id === selectedEntry.recordingId) && <RecordingInformation
              key={selectedEntry.recordingId}
              recording={recordings.find(recording => recording.id === selectedEntry.recordingId)!}
              onSaved={onLibraryChanged}
            />}
            {!selectedEntry.isSampleData && <div className="mt-3 flex flex-col gap-2">
              <label htmlFor="library-edo-text" className="text-sm font-semibold">Edo translation (optional)</label>
              <input id="library-edo-text" className="edo-input" value={editText} onChange={event => setEditText(event.target.value)} />
              <button disabled={busy} className="edo-secondary-btn" onClick={async () => {
                setBusy(true);
                try { await onEditText(selectedEntry.id, editText); setSelectedEntry(null); }
                catch (error) { setError(String(error)); }
                finally { setBusy(false); }
              }}>Save translation text</button>
              <button disabled={busy} className="edo-secondary-btn text-red-700" onClick={async () => {
                if (!window.confirm(`Remove “${selectedEntry.english}” from the lesson list? Its original recording remains protected and included in exports.`)) return;
                setBusy(true);
                try { await onDeleteLesson(selectedEntry.id); stopActivePlayback(); setPlayingId(null); setSelectedEntry(null); }
                catch (error) { setError(String(error)); }
                finally { setBusy(false); }
              }}>Remove lesson</button>
              {error && <p role="alert" className="text-red-700 text-sm">{error}</p>}
            </div>}
            <div className="mt-4 flex flex-col gap-2.5">
              {selectedEntry.hasAudio && (
                <button
                  type="button"
                  onClick={(e) => handlePlayWordAudio(e, selectedEntry)}
                  className="edo-primary-btn bg-[#157A4C] text-white"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>{playingId === selectedEntry.id ? 'Stop Recorded Pronunciation' : 'Play Recorded Pronunciation'}</span>
                </button>
              )}

              {(!selectedEntry.edoText || !selectedEntry.hasAudio) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEntry(null);
                    onJumpToHelpOthers();
                  }}
                  className="edo-primary-btn bg-[#1D6CE0] text-white"
                >
                  {!selectedEntry.edoText ? (
                    <>
                      <FileEdit className="w-4 h-4" />
                      <span>Help Write This Word in Edo</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      <span>Help Record Pronunciation</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
