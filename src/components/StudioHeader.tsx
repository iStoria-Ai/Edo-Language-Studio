import React from 'react';
import { X, Settings, Search } from 'lucide-react';

export type HeaderTheme = 'default' | 'green' | 'blue' | 'yellow' | 'purple';

interface StudioHeaderProps {
  theme?: HeaderTheme;
  sectionLabel?: string;
  rightAction?: 'close' | 'settings' | 'search' | 'none';
  onRightAction?: () => void;
  onLogoClick?: () => void;
}

const THEME_STYLES: Record<
  HeaderTheme,
  { badgeBg: string; badgeText: string; topBorder: string }
> = {
  default: {
    badgeBg: '#EFE9DA',
    badgeText: '#2A352D',
    topBorder: '#157A4C'
  },
  green: {
    badgeBg: '#E6F4ED',
    badgeText: '#157A4C',
    topBorder: '#157A4C'
  },
  blue: {
    badgeBg: '#E8F1FD',
    badgeText: '#1D6CE0',
    topBorder: '#1D6CE0'
  },
  yellow: {
    badgeBg: '#FEF5D4',
    badgeText: '#7A5900',
    topBorder: '#F4C330'
  },
  purple: {
    badgeBg: '#F1ECFA',
    badgeText: '#6E4BC3',
    topBorder: '#6E4BC3'
  }
};

export const StudioHeader: React.FC<StudioHeaderProps> = ({
  theme = 'default',
  sectionLabel,
  rightAction = 'none',
  onRightAction,
  onLogoClick
}) => {
  const style = THEME_STYLES[theme];

  return (
    <div className="w-full shrink-0 bg-[#FAF7F0]">
      {/* Consistent 6px Section Accent Bar */}
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: style.topBorder }}
      />

      {/* Consistent 62px Header Row with 20px (px-5) Horizontal Padding */}
      <header className="w-full min-h-[62px] px-5 py-2.5 flex items-center justify-between gap-2 select-none">
        <div
          onClick={onLogoClick}
          className={`flex items-center gap-3 min-w-0 ${
            onLogoClick ? 'cursor-pointer' : ''
          }`}
        >
          <div className="w-[42px] h-[42px] rounded-full overflow-hidden bg-[#F3EDE0] border border-[#DFD5C0] flex items-center justify-center shrink-0 shadow-sm">
            <img
              src={`${import.meta.env.BASE_URL}assets/edo-bronze-icon.jpg`}
              alt="Edo Bronze Head Logo"
              className="w-full h-full object-cover scale-110"
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[18.5px] font-bold tracking-tight text-[#18241B] leading-tight truncate">
              Edo Language Studio
            </span>
            {sectionLabel && (
              <span
                style={{
                  backgroundColor: style.badgeBg,
                  color: style.badgeText
                }}
                className="inline-flex items-center self-start px-2 py-0.5 mt-0.5 rounded-md text-[11.5px] font-bold tracking-wide leading-tight"
              >
                {sectionLabel}
              </span>
            )}
          </div>
        </div>

        {rightAction !== 'none' ? (
          <button
            type="button"
            onClick={onRightAction}
            aria-label={rightAction}
            className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-[#2E3A31] hover:bg-[#EFE9DA] active:scale-95 transition shrink-0"
          >
            {rightAction === 'close' && <X className="w-6 h-6 stroke-[2.2]" />}
            {rightAction === 'settings' && <Settings className="w-5 h-5 stroke-[2.1]" />}
            {rightAction === 'search' && <Search className="w-5 h-5 stroke-[2.2]" />}
          </button>
        ) : (
          <div className="w-[42px] h-[42px] shrink-0" />
        )}
      </header>
    </div>
  );
};
