import React from 'react';
import { ScreenNumber } from '../types/edo';
import { ScreenBadgeHeader } from './ScreenBadgeHeader';

export interface DeviceViewportSpec {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const DEVICE_VIEWPORTS: DeviceViewportSpec[] = [
  { id: 'iphone-modern', label: 'Modern iPhone (393 × 852)', width: 393, height: 852 },
  { id: 'iphone-small', label: 'Small iPhone (375 × 667)', width: 375, height: 667 },
  { id: 'iphone-large', label: 'Large iPhone (430 × 932)', width: 430, height: 932 },
  { id: 'android-typical', label: 'Typical Android (360 × 800)', width: 360, height: 800 },
  { id: 'android-large', label: 'Larger Android (412 × 915)', width: 412, height: 915 }
];

interface PhoneFrameProps {
  screenNumber?: ScreenNumber;
  children: React.ReactNode;
  showDevBadgeAbove?: boolean;
  scaleCompact?: boolean;
  deviceSpec?: DeviceViewportSpec;
  isNativeMobileViewport?: boolean;
  onSelectScreen?: (num: ScreenNumber) => void;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  screenNumber = 1,
  children,
  showDevBadgeAbove = false,
  scaleCompact = false,
  deviceSpec,
  isNativeMobileViewport = false,
  onSelectScreen
}) => {
  // 1. Mobile presentation (< 640px or native iOS/Android Capacitor):
  // Full-bleed application filling 100% of the viewport with NO extra phone frame or cream margins.
  if (isNativeMobileViewport && !scaleCompact) {
    return (
      <div
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
        className="w-full h-[100dvh] min-h-[100dvh] flex flex-col bg-[#FAF7F0] overflow-hidden"
      >
        <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
    );
  }

  // 2. Desktop web presentation:
  // Clean decorative phone-shaped frame centered on a warm cream page background.
  // No fake status bar (9:41, battery, wifi, notch) and no numbered prototype badges in public view.
  const targetWidth = scaleCompact ? 340 : deviceSpec ? deviceSpec.width : 393;
  const targetHeightStyle = scaleCompact
    ? '700px'
    : deviceSpec
    ? `min(${deviceSpec.height}px, calc(100dvh - 36px))`
    : 'min(844px, calc(100dvh - 36px))';

  return (
    <div className="flex flex-col items-center justify-center shrink-0 max-h-full">
      {showDevBadgeAbove && (
        <div className="mb-3">
          <ScreenBadgeHeader
            screenNumber={screenNumber}
            compact={scaleCompact}
            onClick={onSelectScreen ? () => onSelectScreen(screenNumber) : undefined}
          />
        </div>
      )}

      {/* Clean Decorative Phone Frame Around the Real Interactive Application */}
      <div
        style={{ width: `${targetWidth + 20}px` }}
        className="relative bg-[#181C19] rounded-[44px] p-[10px] shadow-[0_22px_60px_rgba(24,28,25,0.22)] border-[2px] border-[#2E3430] shrink-0 transition-all duration-200"
      >
        <div
          style={{
            width: `${targetWidth}px`,
            height: targetHeightStyle,
            minHeight: '560px'
          }}
          className="relative bg-[#FAF7F0] rounded-[34px] overflow-hidden flex flex-col"
        >
          {/* Real Interactive Application Content */}
          <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
