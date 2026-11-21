import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  meta?: string | number;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  align?: 'left' | 'right';
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  icon,
  align = 'left',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedOption = options.find((opt) => opt.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => {
          if (!disabled) setIsOpen((prev) => !prev);
        }}
        className={`w-full h-11 rounded-xl border bg-[#000000]/55 backdrop-blur-md px-3 text-xs sm:text-sm text-neutral-100 flex items-center justify-between gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none ${
          isOpen
            ? 'border-[#BEF264] ring-1 ring-[#BEF264]/45'
            : 'border-white/15 hover:border-[#BEF264]/60'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {icon && <span className="shrink-0 text-[#BEF264]">{icon}</span>}
          <span className="truncate">
            {selectedOption
              ? selectedOption.meta !== undefined
                ? `${selectedOption.label} (${selectedOption.meta})`
                : selectedOption.label
              : ''}
          </span>
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#BEF264] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          className={`absolute top-[calc(100%+6px)] z-50 min-w-full w-max max-w-[min(280px,calc(100vw-3rem))] rounded-xl border border-[#BEF264]/45 bg-[#000000]/92 backdrop-blur-xl shadow-[0_14px_44px_rgba(0,0,0,0.85),0_0_32px_rgba(190,242,100,0.18)] overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="max-h-64 overflow-y-auto no-scrollbar p-1.5 space-y-0.5">
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#BEF264] text-[#000000] font-semibold'
                      : 'text-neutral-200 hover:bg-[#BEF264]/15 hover:text-[#BEF264]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {opt.meta !== undefined && (
                      <span
                        className={`font-mono text-[11px] tabular-nums ${
                          isSelected ? 'text-[#000000]/80' : 'text-[#BEF264]/80'
                        }`}
                      >
                        {opt.meta}
                      </span>
                    )}
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-[#000000]" aria-hidden="true" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
