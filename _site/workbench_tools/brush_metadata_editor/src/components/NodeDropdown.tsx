import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { LUANTI_NODES } from '../data/presets';

interface NodeDropdownProps {
  id?: string;
  value: string;
  onChange: (nodeId: string) => void;
  placeholder?: string;
  label?: string;
}

export function NodeDropdown({
  id,
  value,
  onChange,
  placeholder = 'default:stone',
}: NodeDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const filteredNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LUANTI_NODES;
    return LUANTI_NODES.filter(
      (n) =>
        n.id.toLowerCase().includes(q) ||
        n.label.toLowerCase().includes(q) ||
        n.group.toLowerCase().includes(q)
    );
  }, [query]);

  const matchedLabel = useMemo(() => {
    return LUANTI_NODES.find((n) => n.id === value.trim())?.label;
  }, [value]);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/[0.04] px-3.5 font-mono text-sm text-[#FFFFFF] placeholder:text-white/40 transition-colors focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Toggle Luanti node dropdown"
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all duration-150 ${
            open
              ? 'border-[#BEF264] bg-[#BEF264] text-[#000000]'
              : 'border-white/20 bg-white/[0.04] text-[#FFFFFF] hover:border-[#BEF264] hover:text-[#BEF264]'
          }`}
        >
          <span className="hidden sm:inline">
            {matchedLabel ? matchedLabel : 'Nodes'}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-150 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="Luanti Node List"
          className="animate-panel-in absolute left-0 right-0 z-50 mt-2 overflow-hidden rounded-xl border border-[#BEF264]/60 bg-[#000000] shadow-[0_16px_40px_rgba(0,0,0,0.95)]"
        >
          <div className="border-b border-white/10 p-2.5">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-white/50" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter nodes..."
                autoFocus
                className="h-9 w-full rounded-lg border border-white/15 bg-white/[0.04] pl-8 pr-3 text-xs text-[#FFFFFF] placeholder:text-white/40 focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none"
              />
            </div>
          </div>

          <ul className="max-h-60 divide-y divide-white/[0.06] overflow-y-auto p-1.5">
            {filteredNodes.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-white/55">
                No matching nodes. Type any custom node ID directly.
              </li>
            ) : (
              filteredNodes.map((node) => {
                const selected = value.trim() === node.id;
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(node.id);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`flex min-h-[42px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        selected
                          ? 'bg-[#BEF264] text-[#000000]'
                          : 'text-[#FFFFFF] hover:bg-white/[0.08]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-semibold">
                            {node.label}
                          </span>
                          <span
                            className={`text-[11px] ${
                              selected ? 'text-[#000000]/75' : 'text-white/50'
                            }`}
                          >
                            {node.group}
                          </span>
                        </div>
                        <p
                          className={`truncate font-mono text-[11px] ${
                            selected ? 'text-[#000000]/85' : 'text-[#BEF264]'
                          }`}
                        >
                          {node.id}
                        </p>
                      </div>
                      {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
