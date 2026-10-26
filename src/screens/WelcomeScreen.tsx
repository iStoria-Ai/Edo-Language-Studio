import React from 'react';
import { ArrowRight } from 'lucide-react';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => {
  return (
    <div className="edo-screen justify-between overflow-y-auto">
      {/* Top Hero Image with Edo Bronze Head & Benin Palace Courtyard */}
      <div className="relative w-full flex-[1.18] min-h-[265px] max-h-[470px] shrink-0 overflow-hidden bg-[#EFE8D8]">
        <img
          src={`${import.meta.env.BASE_URL}assets/edo-welcome-hero.jpg`}
          alt="Edo Bronze Head Cultural Sculpture"
          className="w-full h-full object-cover object-top"
        />
        {/* Smooth gradient fade into warm cream background */}
        <div
          className="absolute inset-x-0 bottom-0 h-28 pointer-events-none"
          style={{
            background:
              'linear-gradient(to bottom, rgba(250, 247, 240, 0) 0%, rgba(250, 247, 240, 0.88) 68%, #FAF7F0 100%)'
          }}
        />
      </div>

      {/* Lower Content Section — Aligned to Shared Mobile Design System (px-5) */}
      <div className="w-full flex-1 px-5 pt-1 pb-5 flex flex-col items-center justify-between text-center z-10">
        <div className="flex flex-col items-center my-auto py-2">
          <h1 className="font-serif text-[33px] sm:text-[36px] font-bold leading-[1.12] text-[#18261C] tracking-tight">
            Edo Language
            <br />
            Studio
          </h1>

          <p className="mt-3.5 text-[17px] leading-[1.48] text-[#333F36] font-medium max-w-[300px]">
            Teach a language.
            <br />
            Preserve a culture.
            <br />
            Build a smarter tomorrow.
          </p>
        </div>

        {/* Single Main Action Button — No Sign In or Register */}
        <div className="w-full flex flex-col items-center gap-4 pt-2">
          <button
            type="button"
            onClick={onGetStarted}
            className="w-full min-h-[58px] py-4 px-6 rounded-2xl bg-[#157A4C] hover:bg-[#11663F] active:scale-[0.99] text-white font-bold text-[19px] shadow-md flex items-center justify-center gap-2.5 transition-all"
          >
            <span>Get Started</span>
            <ArrowRight className="w-5 h-5 stroke-[2.6]" />
          </button>

          {/* Cultural Footer Emblem */}
          <div className="flex items-center justify-center gap-2.5 text-[#465249] text-[14px] font-semibold">
            <div className="w-6 h-6 rounded-full overflow-hidden border border-[#D5CCB8] bg-[#F3EDE0] flex items-center justify-center shrink-0">
              <img
                src={`${import.meta.env.BASE_URL}assets/edo-bronze-icon.jpg`}
                alt=""
                className="w-full h-full object-cover scale-110"
              />
            </div>
            <span>Edo Language for Everyone</span>
          </div>
        </div>
      </div>
    </div>
  );
};
