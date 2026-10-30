import React from 'react';

export const EDO_SPECIAL_CHARS = ['ẹ', 'ọ', 'vb', 'gh', 'kh', 'mw', 'rh'] as const;

export interface EdoLetterBarProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (nextValue: string) => void;
  className?: string;
  onLetterInserted?: () => void;
}

/**
 * Reusable Edo letters keyboard bar.
 * Displays the standard Edo alphabet buttons (ẹ, ọ, vb, gh, kh, mw, rh)
 * and inserts the letter at the current cursor position or replaces text selection.
 */
export const EdoLetterBar: React.FC<EdoLetterBarProps> = ({
  inputRef,
  value,
  onChange,
  className = 'mt-2',
  onLetterInserted
}) => {
  const handleInsert = (ch: string) => {
    const input = inputRef?.current;
    if (input) {
      const start = input.selectionStart ?? value.length;
      const end = input.selectionEnd ?? value.length;
      const nextValue = value.slice(0, start) + ch + value.slice(end);
      onChange(nextValue);

      const nextCursor = start + ch.length;
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          try {
            inputRef.current.setSelectionRange(nextCursor, nextCursor);
          } catch {
            // Ignore if input type doesn't support selection
          }
        }
      });
    } else {
      onChange(value + ch);
    }

    onLetterInserted?.();
  };

  return (
    <div className={`flex items-center justify-between gap-1 ${className}`}>
      <span className="text-[11.5px] text-[#5E6A62] font-semibold shrink-0">
        Edo letters:
      </span>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {EDO_SPECIAL_CHARS.map((ch) => (
          <button
            key={ch}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleInsert(ch)}
            className="px-2 py-0.5 rounded-md bg-[#EFE9DA] hover:bg-[#E2D9C3] text-[#253028] text-[12px] font-bold transition shrink-0 active:scale-95"
            aria-label={`Insert Edo letter ${ch}`}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
};

