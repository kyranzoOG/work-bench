import React, { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { AssetEntry } from '../types/asset';
import { getModalTextures } from '../utils/formatters';

interface AssetModalProps {
  entry: AssetEntry | null;
  onClose: () => void;
}

export const AssetModal: React.FC<AssetModalProps> = ({ entry, onClose }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [entry?.uid]);

  useEffect(() => {
    if (!entry) return;

    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [entry, onClose]);

  if (!entry) return null;

  const textureSections = getModalTextures(entry);
  const groupEntries = entry.groups ? Object.entries(entry.groups) : [];

  const handleCopyString = async () => {
    const valueToCopy = entry.id;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(valueToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = valueToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-[#000000]/75 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="asset-modal-title"
    >
      <div
        className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-2xl border border-[#BEF264]/35 bg-[#000000]/88 backdrop-blur-xl shadow-[0_0_80px_rgba(190,242,100,0.22)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Top-Right X Close Button Only */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10 bg-[#000000]/60">
          <div className="min-w-0">
            <p className="text-xs font-mono text-[#BEF264] capitalize">
              {entry.category} · {entry.type}
            </p>
            <h2
              id="asset-modal-title"
              className="text-lg sm:text-xl font-semibold text-white tracking-tight break-words mt-0.5"
            >
              {entry.displayName}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-xl border border-white/10 bg-white/5 hover:bg-[#BEF264]/15 hover:border-[#BEF264]/50 flex items-center justify-center text-neutral-300 hover:text-white transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEF264]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body (scrollbar hidden) */}
        <div className="p-5 overflow-y-auto no-scrollbar space-y-5">
          {/* Short Description */}
          <p className="text-sm text-neutral-300 leading-relaxed">
            {entry.shortDescription}
          </p>

          {/* Original Identifier + Copy String */}
          <div>
            <div className="text-xs font-medium text-neutral-400 mb-2">
              Original String / ID
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#000000]/65 p-3">
              <code className="font-mono text-xs text-[#BEF264] break-all">
                {entry.id ? entry.id : '(empty string)'}
              </code>
              <button
                type="button"
                onClick={handleCopyString}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#BEF264]/45 bg-[#BEF264]/15 hover:bg-[#BEF264]/25 text-[#BEF264] text-xs font-medium transition-colors shrink-0 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEF264]"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy String</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Core Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-[#000000]/55 p-3.5">
              <div className="text-xs text-neutral-400 mb-1">Mod Origin</div>
              <div className="font-mono text-sm text-white break-all">
                {entry.modOrigin}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[#000000]/55 p-3.5">
              <div className="text-xs text-neutral-400 mb-1">Type</div>
              <div className="font-mono text-sm text-white capitalize">
                {entry.type}
              </div>
            </div>

            {entry.hpMax !== null && (
              <div className="rounded-xl border border-white/10 bg-[#000000]/55 p-3.5">
                <div className="text-xs text-neutral-400 mb-1">Max HP</div>
                <div className="font-mono text-sm text-white tabular-nums">
                  {entry.hpMax}
                </div>
              </div>
            )}

            {entry.physical !== null && (
              <div className="rounded-xl border border-white/10 bg-[#000000]/55 p-3.5">
                <div className="text-xs text-neutral-400 mb-1">Physical</div>
                <div className="font-mono text-sm text-white">
                  {entry.physical ? 'Yes' : 'No'}
                </div>
              </div>
            )}
          </div>

          {/* Groups */}
          <div>
            <div className="text-xs font-medium text-neutral-400 mb-2">
              Groups
            </div>
            {groupEntries.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#000000]/55 divide-y divide-white/5">
                {groupEntries.map(([groupKey, groupVal]) => (
                  <div
                    key={groupKey}
                    className="flex items-center justify-between gap-4 px-3.5 py-2 text-xs font-mono"
                  >
                    <span className="text-neutral-200 break-all">{groupKey}</span>
                    <span className="text-[#BEF264] tabular-nums shrink-0">
                      {groupVal}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-[#000000]/55 px-3.5 py-2.5 text-xs text-neutral-500">
                No groups assigned
              </div>
            )}
          </div>

          {/* Texture Data (Inventory Image + Named Model/Surface Texture) */}
          <div>
            <div className="text-xs font-medium text-neutral-400 mb-2">
              Textures
            </div>
            {textureSections.length > 0 ? (
              <div className="space-y-3">
                {textureSections.map((section) => (
                  <div
                    key={section.label}
                    className="rounded-xl border border-white/10 bg-[#000000]/55 p-3.5 space-y-2"
                  >
                    <div className="text-xs font-medium text-neutral-300 capitalize">
                      {section.label}
                    </div>
                    <div className="space-y-1.5">
                      {section.layers.map((layer, idx) => {
                        const filename = layer.filename || null;
                        const expression = layer.expression || null;
                        const hasDistinctExpression =
                          expression && filename && expression !== filename;

                        return (
                          <div
                            key={`${section.label}-${idx}`}
                            className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 font-mono text-xs space-y-0.5"
                          >
                            {filename && (
                              <div className="text-[#BEF264] break-all">
                                {filename}
                              </div>
                            )}
                            {(!filename || hasDistinctExpression) && expression && (
                              <div className="text-[11px] text-neutral-400 break-all">
                                {expression}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-[#000000]/55 px-3.5 py-2.5 text-xs text-neutral-500">
                No texture data available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
