import React from 'react';

interface WordIllustrationProps {
  illustrationKey: string;
  emoji?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const WordIllustration: React.FC<WordIllustrationProps> = ({
  illustrationKey,
  emoji = '🖐🏽',
  size = 'lg'
}) => {
  const sizeClasses = {
    sm: 'w-12 h-12 text-[32px]',
    md: 'w-28 h-28 text-[76px]',
    lg: 'w-36 h-36 text-[98px]'
  }[size];

  if (illustrationKey === 'hand') {
    const svgSize = size === 'sm' ? 44 : size === 'md' ? 108 : 144;
    return (
      <div className="inline-flex items-center justify-center select-none shrink-0">
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 140 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-md max-w-full h-auto"
        >
          <defs>
            <linearGradient id="palmGrad" x1="35" y1="15" x2="105" y2="128" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#F5B289" />
              <stop offset="55%" stopColor="#E38F60" />
              <stop offset="100%" stopColor="#C86F3F" />
            </linearGradient>
            <linearGradient id="CreaseGrad" x1="48" y1="75" x2="96" y2="108" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#9E4B22" stopOpacity="0.48" />
              <stop offset="100%" stopColor="#9E4B22" stopOpacity="0.12" />
            </linearGradient>
          </defs>
          {/* Single continuous closed path for natural open hand without any fill gaps */}
          <path
            d="M41 74
               L41 34 C41 29.5 44.6 26 49 26 C53.4 26 57 29.5 57 34
               L57 61
               L59 61
               L59 21 C59 16.5 62.6 13 67 13 C71.4 13 75 16.5 75 21
               L75 61
               L77 61
               L77 26 C77 21.5 80.6 18 85 18 C89.4 18 93 21.5 93 26
               L93 66
               L95 66
               L95 40 C95 35.8 98.4 32.5 102.5 32.5 C106.6 32.5 110 35.8 110 40
               L110 86
               C110 110 93 126 70 126
               C49 126 37 113 32 95
               L19 73
               C16.2 68.4 17.8 62.6 22.5 60
               C27.2 57.4 33 59.2 35.8 63.8
               L41 74 Z"
            fill="url(#palmGrad)"
            stroke="#B45E32"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="58" y1="60" x2="58" y2="69" stroke="#B45E32" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="76" y1="60" x2="76" y2="69" stroke="#B45E32" strokeWidth="2.2" strokeLinecap="round" />
          <line x1="94" y1="65" x2="94" y2="73" stroke="#B45E32" strokeWidth="2.2" strokeLinecap="round" />
          <path
            d="M47 86C56 80 78 80 93 90"
            stroke="url(#CreaseGrad)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d="M53 97C63 95 75 98 81 110"
            stroke="url(#CreaseGrad)"
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <line x1="45" y1="46" x2="53" y2="46" stroke="#B45E32" strokeOpacity="0.32" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="63" y1="39" x2="71" y2="39" stroke="#B45E32" strokeOpacity="0.32" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="81" y1="43" x2="89" y2="43" stroke="#B45E32" strokeOpacity="0.32" strokeWidth="1.8" strokeLinecap="round" />
          <line x1="99" y1="53" x2="106" y2="53" stroke="#B45E32" strokeOpacity="0.32" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses} inline-flex items-center justify-center select-none leading-none drop-shadow-sm shrink-0`}
      role="img"
      aria-label={illustrationKey}
    >
      {emoji}
    </div>
  );
};
