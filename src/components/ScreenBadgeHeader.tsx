import React from 'react';
import { ScreenNumber } from '../types/edo';

export interface ScreenBadgeMeta {
  number: ScreenNumber;
  title: string;
  shortTitle: string;
  sectionGroup: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

export const SCREEN_BADGE_MAP: Record<ScreenNumber, ScreenBadgeMeta> = {
  1: {
    number: 1,
    title: '1. Welcome (No Login)',
    shortTitle: '1. Welcome',
    sectionGroup: 'Welcome',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  },
  2: {
    number: 2,
    title: '2. Home Dashboard',
    shortTitle: '2. Dashboard',
    sectionGroup: 'Dashboard',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  },
  3: {
    number: 3,
    title: '3. Teach Edo (Record on One Screen)',
    shortTitle: '3. Teach Edo',
    sectionGroup: 'Green — Teach Edo',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  },
  4: {
    number: 4,
    title: '4. Voice Recorded (Play & Save)',
    shortTitle: '4. Voice Recorded',
    sectionGroup: 'Green — Teach Edo',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  },
  5: {
    number: 5,
    title: '5. Write the Word (Optional)',
    shortTitle: '5. Write Word',
    sectionGroup: 'Green — Teach Edo',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  },
  6: {
    number: 6,
    title: '6. Thank You & Next',
    shortTitle: '6. Thank You',
    sectionGroup: 'Green — Teach Edo',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  },
  7: {
    number: 7,
    title: '7. Help Others (Write Only)',
    shortTitle: '7. Help Others',
    sectionGroup: 'Blue — Help Others',
    bgColor: '#1D6CE0',
    textColor: '#FFFFFF',
    borderColor: '#1552B0'
  },
  8: {
    number: 8,
    title: '8. Language Library',
    shortTitle: '8. Library',
    sectionGroup: 'Yellow — Language Library',
    bgColor: '#F4C330',
    textColor: '#261C00',
    borderColor: '#D4A318'
  },
  9: {
    number: 9,
    title: '9. AI Progress',
    shortTitle: '9. AI Progress',
    sectionGroup: 'Purple — AI Progress',
    bgColor: '#6E4BC3',
    textColor: '#FFFFFF',
    borderColor: '#52349B'
  },
  10: {
    number: 10,
    title: '10. Teach Something Else (Your Own Word)',
    shortTitle: '10. Teach More',
    sectionGroup: 'Green — Teach Edo',
    bgColor: '#157A4C',
    textColor: '#FFFFFF',
    borderColor: '#0E5836'
  }
};

interface ScreenBadgeHeaderProps {
  screenNumber: ScreenNumber;
  compact?: boolean;
  onClick?: () => void;
}

export const ScreenBadgeHeader: React.FC<ScreenBadgeHeaderProps> = ({
  screenNumber,
  compact = false,
  onClick
}) => {
  const meta = SCREEN_BADGE_MAP[screenNumber];

  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: meta.bgColor,
        color: meta.textColor,
        borderColor: meta.borderColor
      }}
      className={`inline-flex items-center justify-center rounded-xl font-bold shadow-md border transition-transform ${
        onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.99]' : ''
      } ${
        compact
          ? 'px-3 py-1.5 text-xs sm:text-sm'
          : 'px-5 py-2 text-sm sm:text-base tracking-tight'
      }`}
    >
      <span>{meta.title}</span>
    </div>
  );
};
