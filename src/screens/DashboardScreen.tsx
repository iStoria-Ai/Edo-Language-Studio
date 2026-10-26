import React from 'react';
import { Mic, Users, BookOpen, BarChart3, Home, MessageSquarePlus } from 'lucide-react';
import { AppSection, StudioStats } from '../types/edo';
import { StudioHeader } from '../components/StudioHeader';

interface DashboardScreenProps {
  onNavigate: (section: AppSection) => void;
  onOpenSystemInfo?: () => void;
  stats: StudioStats;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigate,
  onOpenSystemInfo,
  stats
}) => {
  return (
    <div className="edo-screen">
      {/* Unified Studio Header */}
      <StudioHeader
        theme="default"
        rightAction="settings"
        onRightAction={onOpenSystemInfo}
        onLogoClick={() => onNavigate('welcome')}
      />

      {/* Main Responsive Body (px-5 matching Write the Word) */}
      <div className="w-full flex-1 flex flex-col justify-between px-5 pt-1 pb-3 overflow-y-auto min-h-0">
        {/* Greeting Subtitle */}
        <div className="py-1.5 text-center shrink-0">
          <p className="text-[20px] font-bold text-[#1E2A21] tracking-tight">
            Help me learn Edo today.
          </p>
        </div>

        {/* 2 x 2 Evenly Sized Colored Dashboard Cards Grid */}
        <div className="w-full flex-1 grid grid-cols-2 grid-rows-2 gap-3.5 my-1 min-h-[320px]">
          {/* 1. GREEN — Teach Edo */}
          <button
            type="button"
            onClick={() => onNavigate('teach')}
            className="group relative rounded-2xl bg-[#157A4C] hover:bg-[#126941] active:scale-[0.98] text-white p-3.5 flex flex-col items-center justify-center text-center shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2 shrink-0">
              <Mic className="w-6 h-6 stroke-[2.3] text-white" />
            </div>
            <h2 className="text-[19px] font-bold leading-tight mb-1">
              Teach Edo
            </h2>
            <p className="text-[13px] leading-snug text-white/95 font-medium max-w-[142px]">
              Answer a word and teach me Edo.
            </p>
          </button>

          {/* 2. BLUE — Help Others */}
          <button
            type="button"
            onClick={() => onNavigate('help')}
            className="group relative rounded-2xl bg-[#1D6CE0] hover:bg-[#175BC2] active:scale-[0.98] text-white p-3.5 flex flex-col items-center justify-center text-center shadow-md transition-all"
          >
            {stats.localNeedsHelpCount > 0 && (
              <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-white/25 text-white text-[11px] font-bold">
                {stats.localNeedsHelpCount}
              </span>
            )}
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2 shrink-0">
              <Users className="w-6 h-6 stroke-[2.3] text-white" />
            </div>
            <h2 className="text-[19px] font-bold leading-tight mb-1">
              Help Others
            </h2>
            <p className="text-[13px] leading-snug text-white/95 font-medium max-w-[142px]">
              Complete missing words or writing.
            </p>
          </button>

          {/* 3. YELLOW — Language Library */}
          <button
            type="button"
            onClick={() => onNavigate('library')}
            className="group relative rounded-2xl bg-[#F4C330] hover:bg-[#E7B622] active:scale-[0.98] text-[#261C00] p-3.5 flex flex-col items-center justify-center text-center shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center mb-1.5 shrink-0">
              <BookOpen className="w-6 h-6 stroke-[2.3] text-[#261C00]" />
            </div>
            <h2 className="text-[18.5px] font-bold leading-[1.12] mb-1">
              Language
              <br />
              Library
            </h2>
            <p className="text-[12.5px] leading-snug text-[#3B2D04] font-medium max-w-[142px]">
              Explore words, pictures and pronunciations.
            </p>
          </button>

          {/* 4. PURPLE — AI Progress */}
          <button
            type="button"
            onClick={() => onNavigate('progress')}
            className="group relative rounded-2xl bg-[#6E4BC3] hover:bg-[#5E3DB0] active:scale-[0.98] text-white p-3.5 flex flex-col items-center justify-center text-center shadow-md transition-all"
          >
            <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center mb-2 shrink-0">
              <BarChart3 className="w-6 h-6 stroke-[2.3] text-white" />
            </div>
            <h2 className="text-[19px] font-bold leading-tight mb-1">
              AI Progress
            </h2>
            <p className="text-[13px] leading-snug text-white/95 font-medium max-w-[142px]">
              See how our Edo language library is growing.
            </p>
          </button>
        </div>

        {/* 5. Teach Something Else Section Button */}
        <div className="pt-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('teach-custom')}
            className="w-full min-h-[46px] py-2.5 px-4 rounded-2xl bg-[#E8F3EC] hover:bg-[#DCECE2] active:scale-[0.99] text-[#157A4C] border border-[#C6E2D1] flex items-center justify-center gap-2 text-[14.5px] font-bold transition shadow-sm"
          >
            <MessageSquarePlus className="w-4 h-4 stroke-[2.3] shrink-0" />
            <span>Teach Something Else</span>
          </button>
        </div>
      </div>

      {/* Consistent Bottom Navigation Bar Positioned Above System Gesture Area */}
      <nav className="w-full shrink-0 border-t border-[#E6DFCF] bg-[#FDFBF7] px-6 py-2.5 flex items-center justify-around">
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="flex flex-col items-center gap-1 text-[#157A4C] font-bold text-[12.5px] min-w-[64px]"
        >
          <Home className="w-5 h-5 stroke-[2.4]" />
          <span>Home</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('library')}
          className="flex flex-col items-center gap-1 text-[#556058] hover:text-[#261C00] font-semibold text-[12.5px] min-w-[64px] transition"
        >
          <BookOpen className="w-5 h-5 stroke-[2.1]" />
          <span>Library</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('progress')}
          className="flex flex-col items-center gap-1 text-[#556058] hover:text-[#6E4BC3] font-semibold text-[12.5px] min-w-[64px] transition"
        >
          <BarChart3 className="w-5 h-5 stroke-[2.1]" />
          <span>Progress</span>
        </button>
      </nav>
    </div>
  );
};
