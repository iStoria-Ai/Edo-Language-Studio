import React from 'react';
import {
  Bus,
  Car,
  Bike,
  Train,
  Plane,
  Ship,
  Home,
  Bed,
  Utensils,
  Apple,
  Users,
  Sun,
  CloudRain,
  Trees,
  BookOpen,
  Footprints,
  Building,
  Flame,
  Fish,
  Baby,
  Coffee,
  Heart,
  Smile,
  ShoppingBag,
  Briefcase,
  Music,
  Sparkles,
  Moon,
  Eye,
  Activity,
  Compass,
  Key,
  Layers,
  Milestone,
  Truck,
  Armchair,
  DoorClosed,
  Volume2,
  MessageCircle,
  Wind,
  Mountain,
  Globe,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  User,
  Lamp,
  Pencil,
  Check,
  X
} from 'lucide-react';

interface WordIllustrationProps {
  illustrationKey: string;
  icon?: string;
  emoji?: string;
  size?: 'sm' | 'md' | 'lg';
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Bus,
  Car,
  Bike,
  Train,
  Plane,
  Ship,
  Home,
  Bed,
  Utensils,
  Apple,
  Users,
  Sun,
  CloudRain,
  Trees,
  BookOpen,
  Footprints,
  Building,
  Flame,
  Fish,
  Baby,
  Coffee,
  Heart,
  Smile,
  ShoppingBag,
  Briefcase,
  Music,
  Sparkles,
  Moon,
  Eye,
  Activity,
  Compass,
  Key,
  Layers,
  Milestone,
  Truck,
  Armchair,
  DoorClosed,
  Volume2,
  MessageCircle,
  Wind,
  Mountain,
  Globe,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  User,
  Lamp,
  Pencil,
  Check,
  X,
  // Common lowercase aliases
  bus: Bus,
  car: Car,
  bicycle: Bike,
  train: Train,
  airplane: Plane,
  boat: Ship,
  house: Home,
  door: DoorClosed,
  bed: Bed,
  chair: Armchair,
  food: Utensils,
  water: Coffee,
  tree: Trees,
  sun: Sun,
  rain: CloudRain,
  book: BookOpen,
  child: Baby,
  chat: MessageCircle,
  welcome: Smile,
  heart: Heart
};

export const WordIllustration: React.FC<WordIllustrationProps> = ({
  illustrationKey,
  icon,
  emoji = '🖐🏽',
  size = 'lg'
}) => {
  const sizeClasses = {
    sm: 'w-10 h-10 text-[26px]',
    md: 'w-24 h-24 text-[64px]',
    lg: 'w-32 h-32 text-[80px]'
  }[size];

  const iconSizes = {
    sm: 'w-5 h-5 stroke-[2.2]',
    md: 'w-12 h-12 stroke-[2]',
    lg: 'w-16 h-16 stroke-[1.8]'
  }[size];

  // Specific custom vector illustration for "Hand"
  if (illustrationKey === 'hand' || illustrationKey === 'word-hand') {
    const svgSize = size === 'sm' ? 40 : size === 'md' ? 96 : 130;
    return (
      <div className="inline-flex items-center justify-center select-none shrink-0">
        <svg
          width={svgSize}
          height={svgSize}
          viewBox="0 0 140 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="drop-shadow-sm max-w-full h-auto"
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
        </svg>
      </div>
    );
  }

  // Check for Lucide Icon Match
  const IconComponent = (icon && ICON_MAP[icon]) || ICON_MAP[illustrationKey];
  if (IconComponent) {
    return (
      <div
        className={`${sizeClasses} rounded-2xl bg-[#E8F5E9] text-[#157A4C] inline-flex items-center justify-center select-none shadow-xs shrink-0`}
        role="img"
        aria-label={illustrationKey}
      >
        <IconComponent className={iconSizes} />
      </div>
    );
  }

  // Fallback to Emoji
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
