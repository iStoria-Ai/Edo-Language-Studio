import React from 'react';
import {
  BookOpen,
  Mic,
  PenTool,
  MessageSquare,
  CheckCircle2,
  ArrowRight,
  Lock,
  Sparkles,
  Info
} from 'lucide-react';
import { StudioStats } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';

interface AiProgressScreenProps {
  stats: StudioStats;
  onBackToDashboard: () => void;
}

export const AiProgressScreen: React.FC<AiProgressScreenProps> = ({
  stats,
  onBackToDashboard
}) => {
  const stages = [
    {
      id: 1,
      title: 'Stage 1 – Basic words',
      subtitle: '(Hand, leg, eye, water...)',
      status: 'collecting_active'
    },
    {
      id: 2,
      title: 'Stage 2 – Short phrases',
      subtitle: '(My hand, eat, drink, greetings...)',
      status: 'collecting_active'
    },
    {
      id: 3,
      title: 'Stage 3 – Simple sentences',
      subtitle: '(How are you? Where are you going?...)',
      status: 'in_progress'
    },
    {
      id: 4,
      title: 'Stage 4 – Everyday conversations',
      subtitle: '(Home, market, family stories...)',
      status: 'in_progress'
    },
    {
      id: 5,
      title: 'Stage 5 – Speaking & asking questions in Edo',
      subtitle: '(Future AI capability — Not yet trained)',
      status: 'future'
    }
  ];

  return (
    <div className="edo-screen">
      {/* Unified Studio Header (Purple Section) */}
      <StudioHeader
        theme="purple"
        sectionLabel="AI Progress"
        rightAction="close"
        onRightAction={onBackToDashboard}
        onLogoClick={onBackToDashboard}
      />

      <div className="edo-screen-scroll pt-1 gap-3.5">
        {/* Heading & Metrics Section */}
        <div>
          <div className="flex items-center justify-center gap-2.5 pt-0.5 pb-2">
            <div className="flex items-end gap-1 h-6">
              <span className="w-1.5 h-2.5 bg-[#157A4C] rounded-sm" />
              <span className="w-1.5 h-3.5 bg-[#157A4C] rounded-sm" />
              <span className="w-1.5 h-5 bg-[#6E4BC3] rounded-sm" />
              <span className="w-1.5 h-6 bg-[#6E4BC3] rounded-sm" />
            </div>
            <h1 className="text-[20px] font-bold text-[#1A241D]">
              Our AI is learning Edo
            </h1>
          </div>

          {/* Transparent Demo Disclaimer Banner */}
          <div className="mb-3 px-3.5 py-2 rounded-2xl bg-[#F1ECFA] border border-[#D7C8F3] flex items-start gap-2 text-[11.5px] text-[#442982] font-medium leading-snug">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#6E4BC3]" />
            <span>
              <strong>Prototype Demonstration Metrics:</strong> Target community milestones + your {stats.localContributionsCount} local contributions. AI model training is not yet active.
            </span>
          </div>

          {/* 2 x 2 Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white border border-[#E6DFCF] p-3.5 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-[#E5F4EC] text-[#157A4C] flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-[19px] font-extrabold text-[#18241B] leading-none">
                  {stats.demoWordsCollected.toLocaleString()}
                </p>
                <p className="text-[12px] font-semibold text-[#5A665D] mt-1">
                  Words collected
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E6DFCF] p-3.5 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-[#F1ECFA] text-[#6E4BC3] flex items-center justify-center shrink-0">
                <Mic className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-[19px] font-extrabold text-[#18241B] leading-none">
                  {stats.demoVoiceRecordings.toLocaleString()}
                </p>
                <p className="text-[12px] font-semibold text-[#5A665D] mt-1">
                  Voice recordings
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E6DFCF] p-3.5 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-[#FEF5D4] text-[#9A7000] flex items-center justify-center shrink-0">
                <PenTool className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-[19px] font-extrabold text-[#18241B] leading-none">
                  {stats.demoWrittenWords.toLocaleString()}
                </p>
                <p className="text-[12px] font-semibold text-[#5A665D] mt-1">
                  Written words
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-[#E6DFCF] p-3.5 flex items-center gap-3 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-[#E8F1FD] text-[#1D6CE0] flex items-center justify-center shrink-0">
                <MessageSquare className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <p className="text-[19px] font-extrabold text-[#18241B] leading-none">
                  {stats.demoPhrasesAndSentences.toLocaleString()}
                </p>
                <p className="text-[12px] font-semibold text-[#5A665D] mt-1">
                  Phrases &amp; sentences
                </p>
              </div>
            </div>
          </div>

          {/* Collected vs. Approved vs. Trained AI Status Row */}
          <div className="mt-3 rounded-2xl bg-white border border-[#E6DFCF] px-3.5 py-2.5 flex items-center justify-between text-[12px]">
            <div>
              <span className="text-[#5C665E]">Review Queue: </span>
              <strong className="text-[#6E4BC3]">{stats.localAwaitingReviewCount + 18}</strong>
            </div>
            <div className="h-3.5 w-px bg-[#E0D8C6]" />
            <div>
              <span className="text-[#5C665E]">Needs Help: </span>
              <strong className="text-[#1D6CE0]">{stats.localNeedsHelpCount}</strong>
            </div>
            <div className="h-3.5 w-px bg-[#E0D8C6]" />
            <div>
              <span className="text-[#5C665E]">AI Status: </span>
              <strong className="text-[#785502]">Collecting</strong>
            </div>
          </div>
        </div>

        {/* Learning Stages Timeline */}
        <div className="my-auto py-1">
          <h2 className="text-[15.5px] font-bold text-[#1C241E] mb-2.5">
            Learning stages
          </h2>

          <div className="relative pl-1 space-y-3">
            {stages.map((stage, idx) => {
              const isDoneDemo = stage.status === 'collecting_active';
              const isFuture = stage.status === 'future';
              return (
                <div key={stage.id} className="relative flex items-start justify-between gap-2">
                  {idx < stages.length - 1 && (
                    <div
                      className={`absolute left-[9px] top-5 w-[2px] h-8 ${
                        isDoneDemo ? 'bg-[#157A4C]' : 'bg-[#D5CFC0]'
                      }`}
                    />
                  )}

                  <div className="flex items-start gap-2.5">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 border-2 ${
                        isDoneDemo
                          ? 'bg-[#157A4C] border-[#157A4C] text-white'
                          : isFuture
                          ? 'bg-[#F1ECFA] border-[#6E4BC3]/50 text-[#6E4BC3]'
                          : 'bg-white border-[#B9B2A2]'
                      }`}
                    >
                      {isDoneDemo ? (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#B9B2A2]" />
                      )}
                    </span>

                    <div>
                      <p
                        className={`text-[13.5px] font-bold leading-snug ${
                          isDoneDemo ? 'text-[#1C241E]' : 'text-[#525D55]'
                        }`}
                      >
                        {stage.title}
                      </p>
                      <p className="text-[12px] text-[#66726A] leading-tight">
                        {stage.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 mt-0.5">
                    {isDoneDemo ? (
                      <CheckCircle2 className="w-4 h-4 text-[#157A4C]" />
                    ) : isFuture ? (
                      <Lock className="w-4 h-4 text-[#6E4BC3]" />
                    ) : (
                      <ArrowRight className="w-4 h-4 text-[#8C948E]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Future Edo Speaking Feature (Disabled Preview) */}
        <div className="rounded-2xl bg-[#F1ECFA] border border-[#D5C5F3] p-3.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#6E4BC3] text-white flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-bold text-[#371F6E]">
                  Future Feature: AI Speaks Edo
                </span>
                <span className="px-1.5 py-0.5 rounded bg-[#6E4BC3]/15 text-[#52349B] text-[10px] font-bold uppercase">
                  Planned
                </span>
              </div>
              <p className="text-[11.5px] text-[#4E387E] leading-snug mt-0.5">
                Once enough verified recordings are approved, the AI will ask questions in Edo and power the Edo Language API.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled
            className="px-3 py-1.5 rounded-xl bg-white/70 border border-[#CBB8EE] text-[#6E4BC3]/70 text-[11.5px] font-bold shrink-0 cursor-not-allowed"
          >
            Locked
          </button>
        </div>
      </div>
    </div>
  );
};
