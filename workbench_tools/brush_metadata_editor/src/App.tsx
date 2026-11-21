import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Copy,
  Eraser,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  BRUSH_PRESETS,
  TERRAFORM_MASKS,
  TERRAFORM_MODIFIER_FLAGS,
  TERRAFORM_SHAPES,
  WORLDEDIT_COMMANDS,
  WORLDEDIT_MODIFIER_FLAGS,
  WORLDEDIT_SHAPES,
} from './data/presets';
import { BrandVoxelMark, PresetVectorIcon, ShapeVectorIcon } from './components/ShapeVectors';
import { NodeDropdown } from './components/NodeDropdown';
import { ToastContainer } from './components/Toast';
import type {
  BrushMode,
  BrushPreset,
  CommandHistoryEntry,
  TerraformPrefix,
  TerraformState,
  ToastMessage,
  WorldEditState,
} from './types/brush';

const INITIAL_TERRAFORM: TerraformState = {
  target: 'default:stone',
  shape: 'sphere',
  mask: 'air',
  customMaskNode: '',
  size: 8,
  modifiers: '-natural',
};

const INITIAL_WORLDEDIT: WorldEditState = {
  command: '//brush',
  params: '6 default:stone',
  shape: 'sphere',
  modifiers: '-h',
};

const HISTORY_STORAGE_KEY = 'luanti_brush_studio_history';

function toggleFlagToken(current: string, flag: string): string {
  const tokens = current
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const exists = tokens.includes(flag);
  const next = exists ? tokens.filter((t) => t !== flag) : [...tokens, flag];
  return next.join(' ');
}

function hasFlagToken(current: string, flag: string): boolean {
  return current
    .split(/\s+/)
    .map((t) => t.trim())
    .includes(flag);
}

export default function App() {
  const [activeMode, setActiveMode] = useState<BrushMode>('terraform');
  const [terraformPrefix, setTerraformPrefix] = useState<TerraformPrefix>('/brush');
  const [terraform, setTerraform] = useState<TerraformState>(INITIAL_TERRAFORM);
  const [worldedit, setWorldedit] = useState<WorldEditState>(INITIAL_WORLDEDIT);
  const [copiedRecently, setCopiedRecently] = useState(false);
  const [flashCommand, setFlashCommand] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [history, setHistory] = useState<CommandHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // Ignore storage access errors
    }
    return [];
  });

  const toastCounter = useRef(1);
  const copyTimerRef = useRef<number | null>(null);
  const bgContainerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const updatePointerGlow = useCallback((clientX: number, clientY: number) => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      if (bgContainerRef.current) {
        bgContainerRef.current.style.setProperty('--px', `${clientX}px`);
        bgContainerRef.current.style.setProperty('--py', `${clientY}px`);
      }
      rafRef.current = null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const showToast = useCallback((title: string, detail?: string) => {
    const id = toastCounter.current++;
    setToasts((prev) => [...prev.slice(-2), { id, title, detail }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage write errors
    }
  }, [history]);

  // Compute live Minetest / Luanti command output
  const generatedCommand = useMemo(() => {
    if (activeMode === 'terraform') {
      const shape = terraform.shape.trim() || 'sphere';
      const size = Math.max(1, Math.min(100, Number(terraform.size) || 1));
      const target = terraform.target.trim() || 'default:stone';
      const maskValue =
        terraform.mask === 'custom'
          ? terraform.customMaskNode.trim()
          : terraform.mask !== 'none'
            ? terraform.mask.trim()
            : '';
      const mods = terraform.modifiers.trim();

      const parts = [terraformPrefix, shape, String(size), target];
      if (maskValue) {
        parts.push(`mask:${maskValue}`);
      }
      if (mods) {
        parts.push(mods);
      }
      return parts.join(' ');
    }

    const cmd = worldedit.command.trim() || '//brush';
    const shape = worldedit.shape.trim();
    const params = worldedit.params.trim();
    const mods = worldedit.modifiers.trim();

    const parts = [cmd];
    if (cmd === '//brush' && shape && shape !== 'selection') {
      parts.push(shape);
    } else if (
      shape &&
      shape !== 'selection' &&
      !cmd.includes(shape) &&
      cmd !== '//set' &&
      cmd !== '//replace' &&
      cmd !== '//mix' &&
      cmd !== '//smooth' &&
      cmd !== '//dig'
    ) {
      parts.push(shape);
    }
    if (params) {
      parts.push(params);
    }
    if (mods) {
      parts.push(mods);
    }
    return parts.join(' ');
  }, [activeMode, terraform, terraformPrefix, worldedit]);

  // Trigger subtle highlight pulse on command change
  useEffect(() => {
    setFlashCommand(true);
    const t = window.setTimeout(() => setFlashCommand(false), 450);
    return () => window.clearTimeout(t);
  }, [generatedCommand]);

  // Approximate voxel volume for builder feedback
  const estimatedBlocks = useMemo(() => {
    const r = Math.max(1, Number(terraform.size) || 1);
    const s = terraform.shape;
    const isHollow = hasFlagToken(terraform.modifiers, '-hollow');
    let vol = Math.round((4 / 3) * Math.PI * Math.pow(r, 3));
    if (s === 'cube') vol = Math.pow(r * 2 + 1, 3);
    else if (s === 'cylinder') vol = Math.round(Math.PI * r * r * (r * 2 + 1));
    else if (s === 'dome') vol = Math.round((2 / 3) * Math.PI * Math.pow(r, 3));
    else if (s === 'cone') vol = Math.round((1 / 3) * Math.PI * r * r * (r * 2));
    else if (s === 'pyramid') vol = Math.round((1 / 3) * Math.pow(r * 2 + 1, 2) * (r * 1.5));
    else if (s === 'disc') vol = Math.round(Math.PI * r * r);
    else if (s === 'line') vol = r * 2 + 1;

    if (isHollow && s !== 'disc' && s !== 'line') {
      vol = Math.max(1, Math.round(vol * 0.28));
    }
    return vol;
  }, [terraform.size, terraform.shape, terraform.modifiers]);

  const recordHistory = useCallback(
    (cmd: string, mode: BrushMode) => {
      const now = new Date();
      const timestamp = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      setHistory((prev) => {
        const filtered = prev.filter((item) => item.command !== cmd);
        return [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            command: cmd,
            mode,
            timestamp,
          },
          ...filtered,
        ].slice(0, 12);
      });
    },
    []
  );

  const handleCopyCommand = useCallback(
    async (cmdToCopy?: string) => {
      const text = cmdToCopy ?? generatedCommand;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      if (!cmdToCopy) {
        setCopiedRecently(true);
        if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopiedRecently(false), 1800);
        recordHistory(text, activeMode);
      }
      showToast('Command copied to clipboard', text);
    },
    [activeMode, generatedCommand, recordHistory, showToast]
  );

  const handleSaveHistory = useCallback(() => {
    recordHistory(generatedCommand, activeMode);
    showToast('Saved to command history', generatedCommand);
  }, [activeMode, generatedCommand, recordHistory, showToast]);

  const handleReset = useCallback(() => {
    if (activeMode === 'terraform') {
      setTerraform(INITIAL_TERRAFORM);
      setTerraformPrefix('/brush');
      showToast('Terraform parameters reset', 'Restored default sphere brush');
    } else {
      setWorldedit(INITIAL_WORLDEDIT);
      showToast('WorldEdit parameters reset', 'Restored default //brush setup');
    }
  }, [activeMode, showToast]);

  const applyPreset = useCallback(
    (preset: BrushPreset) => {
      setActiveMode(preset.mode);
      if (preset.mode === 'terraform' && preset.terraform) {
        setTerraform((prev) => ({
          ...INITIAL_TERRAFORM,
          ...prev,
          ...preset.terraform,
        }));
      } else if (preset.mode === 'worldedit' && preset.worldedit) {
        setWorldedit((prev) => ({
          ...INITIAL_WORLDEDIT,
          ...prev,
          ...preset.worldedit,
        }));
      }
      showToast(`Loaded preset: ${preset.name}`, preset.category);
    },
    [showToast]
  );

  const parsedWorldEdit = useMemo(() => {
    const trimmed = worldedit.params.trim();
    const match = trimmed.match(/^(\d+)\s+(.*)$/);
    if (match) {
      return {
        radius: Math.max(1, Math.min(100, Number(match[1]) || 1)),
        nodePart: match[2].trim(),
      };
    }
    if (/^\d+$/.test(trimmed)) {
      return {
        radius: Math.max(1, Math.min(100, Number(trimmed) || 1)),
        nodePart: 'default:stone',
      };
    }
    return {
      radius: 6,
      nodePart: trimmed || 'default:stone',
    };
  }, [worldedit.params]);

  const updateWorldEditRadius = useCallback(
    (nextVal: number) => {
      const clamped = Math.max(1, Math.min(100, nextVal || 1));
      setWorldedit((prev) => ({
        ...prev,
        params: `${clamped} ${parsedWorldEdit.nodePart || 'default:stone'}`,
      }));
    },
    [parsedWorldEdit.nodePart]
  );

  const updateWorldEditNode = useCallback(
    (nodeId: string) => {
      setWorldedit((prev) => ({
        ...prev,
        params: `${parsedWorldEdit.radius} ${nodeId}`,
      }));
    },
    [parsedWorldEdit.radius]
  );

  return (
    <div
      ref={bgContainerRef}
      onPointerMove={(e) => updatePointerGlow(e.clientX, e.clientY)}
      onTouchStart={(e) => {
        if (e.touches[0]) {
          updatePointerGlow(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches[0]) {
          updatePointerGlow(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      className="relative min-h-screen overflow-x-hidden bg-[#000000] text-[#FFFFFF]"
    >
      {/* Pistachio Green Gridded Background + Ambient Glow + Interactive Mouse/Touch Glow */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <div className="pistachio-ambient-glow absolute inset-0" />
        <div className="pistachio-grid-base absolute inset-0" />
        <div className="pistachio-grid-active absolute inset-0" />
        <div className="pistachio-pointer-glow absolute inset-0" />
      </div>

      <main className="relative z-10 mx-auto max-w-[1320px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {/* Workspace Title + Mode Switcher */}
        <section id="generator" className="mb-8 border-b border-white/15 pb-7">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <BrandVoxelMark className="h-7 w-7 shrink-0" />
                <h1 className="text-balance text-3xl font-bold tracking-tight text-[#FFFFFF] sm:text-4xl">
                  Brush Generator
                </h1>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/70 sm:text-base">
                Generate Multicraft / Luanti WorldEdit &amp; Terraform brush commands.
              </p>
            </div>

            {/* Segmented Mode Tabs (Preserving #tab-terraform and #tab-worldedit) */}
            <div
              role="tablist"
              aria-label="Command generator mode"
              className="inline-flex w-full rounded-xl border border-white/15 bg-white/[0.04] p-1 sm:w-auto"
            >
              <button
                id="tab-terraform"
                type="button"
                role="tab"
                aria-selected={activeMode === 'terraform'}
                aria-controls="panel-terraform"
                onClick={() => setActiveMode('terraform')}
                className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 sm:flex-initial ${
                  activeMode === 'terraform'
                    ? 'bg-[#BEF264] text-[#000000]'
                    : 'text-white/75 hover:bg-white/[0.06] hover:text-[#FFFFFF]'
                }`}
              >
                <Layers className="h-4 w-4 shrink-0" />
                <span>Terraform Brush</span>
              </button>
              <button
                id="tab-worldedit"
                type="button"
                role="tab"
                aria-selected={activeMode === 'worldedit'}
                aria-controls="panel-worldedit"
                onClick={() => setActiveMode('worldedit')}
                className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-150 sm:flex-initial ${
                  activeMode === 'worldedit'
                    ? 'bg-[#BEF264] text-[#000000]'
                    : 'text-white/75 hover:bg-white/[0.06] hover:text-[#FFFFFF]'
                }`}
              >
                <Terminal className="h-4 w-4 shrink-0" />
                <span>WorldEdit Brush</span>
              </button>
            </div>
          </div>
        </section>

        {/* Primary 2-Column Workspace Grid */}
        <section className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
          {/* Left Column: Parameter Builders (both panels stay mounted to preserve all DOM IDs) */}
          <div className="relative z-20 rounded-xl border border-white/15 bg-[#000000]/80 p-5 backdrop-blur-md sm:p-7 lg:col-span-7">
            {/* TERRAFORM PANEL */}
            <div
              id="panel-terraform"
              role="tabpanel"
              aria-labelledby="tab-terraform"
              aria-hidden={activeMode !== 'terraform'}
              className={
                activeMode === 'terraform'
                  ? 'animate-panel-in space-y-6'
                  : 'hidden'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#FFFFFF]">
                    01. Terraform Brush Parameters
                  </h2>
                  <p className="mt-0.5 text-xs text-white/60">
                    Shape geometry · Target material · Surface masks
                  </p>
                </div>

                {/* Syntax Prefix Selector */}
                <div className="flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.03] p-1">
                  {(['/brush', '//brush', '/terraform'] as TerraformPrefix[]).map(
                    (prefix) => (
                      <button
                        key={prefix}
                        type="button"
                        onClick={() => setTerraformPrefix(prefix)}
                        className={`whitespace-nowrap rounded-md px-2.5 py-1 font-mono text-xs font-medium transition-colors ${
                          terraformPrefix === prefix
                            ? 'bg-[#FFFFFF] text-[#000000]'
                            : 'text-white/70 hover:text-[#FFFFFF]'
                        }`}
                      >
                        {prefix}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Target Node Dropdown (#terraform-target) */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label
                    htmlFor="terraform-target"
                    className="text-sm font-medium text-[#FFFFFF]"
                  >
                    Target Node ID
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setTerraform((prev) => ({ ...prev, target: 'air' }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#BEF264] transition-opacity hover:opacity-80"
                  >
                    <Eraser className="h-3.5 w-3.5" />
                    <span>Set to air</span>
                  </button>
                </div>
                <NodeDropdown
                  id="terraform-target"
                  value={terraform.target}
                  onChange={(nextNode) =>
                    setTerraform((prev) => ({ ...prev, target: nextNode }))
                  }
                  placeholder="default:stone"
                />
              </div>

              {/* Shape Selector (Preserves #terraform-shape select + tactile SVG grid) */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label
                    htmlFor="terraform-shape"
                    className="text-sm font-medium text-[#FFFFFF]"
                  >
                    Brush Geometry
                  </label>
                  <span className="text-xs text-white/60">
                    {
                      TERRAFORM_SHAPES.find((s) => s.value === terraform.shape)
                        ?.summary
                    }
                  </span>
                </div>

                {/* Native select kept synchronized for full DOM compatibility */}
                <select
                  id="terraform-shape"
                  value={terraform.shape}
                  onChange={(e) =>
                    setTerraform((prev) => ({ ...prev, shape: e.target.value }))
                  }
                  className="studio-select sr-only"
                >
                  {TERRAFORM_SHAPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {TERRAFORM_SHAPES.map((item) => {
                    const isActive = terraform.shape === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setTerraform((prev) => ({ ...prev, shape: item.value }))
                        }
                        className={`flex min-h-[52px] items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
                          isActive
                            ? 'border-[#BEF264] bg-[#BEF264] text-[#000000]'
                            : 'border-white/15 bg-white/[0.03] text-[#FFFFFF] hover:border-white/40 hover:bg-white/[0.07]'
                        }`}
                      >
                        <ShapeVectorIcon
                          shape={item.value}
                          active={isActive}
                          className="h-5 w-5 shrink-0"
                        />
                        <span className="truncate text-xs font-semibold">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brush Radius / Size (#terraform-size) */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor="terraform-size"
                    className="text-sm font-medium text-[#FFFFFF]"
                  >
                    Brush Radius (Nodes)
                  </label>
                  <span className="font-mono text-xs tabular-nums text-white/70">
                    Est. {estimatedBlocks.toLocaleString()} blocks
                  </span>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={terraform.size}
                    aria-label="Brush radius slider"
                    onChange={(e) =>
                      setTerraform((prev) => ({
                        ...prev,
                        size: Number(e.target.value) || 1,
                      }))
                    }
                    className="pistachio-slider w-full flex-1"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      id="terraform-size"
                      type="number"
                      min={1}
                      max={100}
                      value={terraform.size}
                      onChange={(e) =>
                        setTerraform((prev) => ({
                          ...prev,
                          size: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className="h-11 w-24 rounded-lg border border-white/20 bg-white/[0.04] px-3 text-center font-mono text-sm font-semibold tabular-nums text-[#BEF264] focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Mask Filter (#terraform-mask) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="terraform-mask"
                    className="mb-2 block text-sm font-medium text-[#FFFFFF]"
                  >
                    Placement Mask
                  </label>
                  <select
                    id="terraform-mask"
                    value={terraform.mask}
                    onChange={(e) =>
                      setTerraform((prev) => ({ ...prev, mask: e.target.value }))
                    }
                    className="studio-select h-11 w-full rounded-lg border border-white/20 bg-[#000000] px-3.5 text-sm text-[#FFFFFF] transition-colors focus:border-[#BEF264] focus:outline-none"
                  >
                    {TERRAFORM_MASKS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="terraform-custom-mask"
                    className="mb-2 block text-sm font-medium text-[#FFFFFF]"
                  >
                    Custom Mask Node
                  </label>
                  <input
                    id="terraform-custom-mask"
                    type="text"
                    disabled={terraform.mask !== 'custom'}
                    value={terraform.customMaskNode}
                    onChange={(e) =>
                      setTerraform((prev) => ({
                        ...prev,
                        customMaskNode: e.target.value,
                      }))
                    }
                    placeholder={
                      terraform.mask === 'custom'
                        ? 'default:dirt'
                        : 'Select Custom Node Filter'
                    }
                    className="h-11 w-full rounded-lg border border-white/20 bg-white/[0.04] px-3.5 font-mono text-sm text-[#FFFFFF] placeholder:text-white/35 transition-colors focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
                  />
                </div>
              </div>

              {/* Terraform Modifiers (#terraform-modifiers) */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label
                    htmlFor="terraform-modifiers"
                    className="text-sm font-medium text-[#FFFFFF]"
                  >
                    Brush Modifiers &amp; Flags
                  </label>
                  {terraform.modifiers && (
                    <button
                      type="button"
                      onClick={() =>
                        setTerraform((prev) => ({ ...prev, modifiers: '' }))
                      }
                      className="text-xs text-white/60 transition-colors hover:text-[#BEF264]"
                    >
                      Clear flags
                    </button>
                  )}
                </div>

                <input
                  id="terraform-modifiers"
                  type="text"
                  value={terraform.modifiers}
                  onChange={(e) =>
                    setTerraform((prev) => ({
                      ...prev,
                      modifiers: e.target.value,
                    }))
                  }
                  placeholder="-natural -smooth"
                  className="mb-3 h-11 w-full rounded-lg border border-white/20 bg-white/[0.04] px-3.5 font-mono text-sm text-[#FFFFFF] placeholder:text-white/40 transition-colors focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none"
                />

                <div className="flex flex-wrap gap-2">
                  {TERRAFORM_MODIFIER_FLAGS.map((mod) => {
                    const active = hasFlagToken(terraform.modifiers, mod.flag);
                    return (
                      <button
                        key={mod.flag}
                        type="button"
                        title={mod.hint}
                        onClick={() =>
                          setTerraform((prev) => ({
                            ...prev,
                            modifiers: toggleFlagToken(prev.modifiers, mod.flag),
                          }))
                        }
                        className={`min-h-[38px] whitespace-nowrap rounded-lg border px-3 py-1.5 font-mono text-xs font-medium transition-all duration-150 ${
                          active
                            ? 'border-[#BEF264] bg-[#BEF264] text-[#000000]'
                            : 'border-white/15 bg-white/[0.03] text-white/80 hover:border-white/40 hover:text-[#FFFFFF]'
                        }`}
                      >
                        {mod.flag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* WORLDEDIT PANEL */}
            <div
              id="panel-worldedit"
              role="tabpanel"
              aria-labelledby="tab-worldedit"
              aria-hidden={activeMode !== 'worldedit'}
              className={
                activeMode === 'worldedit'
                  ? 'animate-panel-in space-y-6'
                  : 'hidden'
              }
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-[#FFFFFF]">
                    01. WorldEdit Command Parameters
                  </h2>
                  <p className="mt-0.5 text-xs text-white/60">
                    Chat commands · Region volumes · Node mix ratios
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#BEF264]">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>WorldEdit Syntax</span>
                </span>
              </div>

              {/* WorldEdit Command (#worldedit-command) */}
              <div>
                <label
                  htmlFor="worldedit-command"
                  className="mb-2 block text-sm font-medium text-[#FFFFFF]"
                >
                  WorldEdit Command
                </label>
                <select
                  id="worldedit-command"
                  value={worldedit.command}
                  onChange={(e) =>
                    setWorldedit((prev) => ({ ...prev, command: e.target.value }))
                  }
                  className="studio-select h-11 w-full rounded-lg border border-white/20 bg-[#000000] px-3.5 font-mono text-sm text-[#FFFFFF] transition-colors focus:border-[#BEF264] focus:outline-none"
                >
                  {WORLDEDIT_COMMANDS.map((cmd) => (
                    <option key={cmd.value} value={cmd.value}>
                      {cmd.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* WorldEdit Shape (#worldedit-shape) */}
              <div>
                <label
                  htmlFor="worldedit-shape"
                  className="mb-2 block text-sm font-medium text-[#FFFFFF]"
                >
                  Brush / Region Shape
                </label>

                <select
                  id="worldedit-shape"
                  value={worldedit.shape}
                  onChange={(e) =>
                    setWorldedit((prev) => ({ ...prev, shape: e.target.value }))
                  }
                  className="studio-select sr-only"
                >
                  {WORLDEDIT_SHAPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {WORLDEDIT_SHAPES.map((item) => {
                    const isActive = worldedit.shape === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() =>
                          setWorldedit((prev) => ({ ...prev, shape: item.value }))
                        }
                        className={`flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all duration-150 ${
                          isActive
                            ? 'border-[#BEF264] bg-[#BEF264] text-[#000000]'
                            : 'border-white/15 bg-white/[0.03] text-[#FFFFFF] hover:border-white/40 hover:bg-white/[0.07]'
                        }`}
                      >
                        <ShapeVectorIcon
                          shape={item.value}
                          active={isActive}
                          className="h-5 w-5 shrink-0"
                        />
                        <span className="truncate text-xs font-semibold">
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* WorldEdit Parameters (#worldedit-params) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#FFFFFF]">
                    Arguments &amp; Node Parameters
                  </span>
                  <span className="text-xs text-white/60">
                    Radius, node IDs, or mix %
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
                  {/* Custom Radius Number Input with Decrease / Increase Buttons */}
                  <div className="sm:col-span-5">
                    <label
                      htmlFor="worldedit-radius-input"
                      className="mb-1.5 block text-xs font-medium text-white/70"
                    >
                      Radius / Size
                    </label>
                    <div className="flex h-11 items-stretch overflow-hidden rounded-lg border border-white/20 bg-white/[0.04]">
                      <button
                        type="button"
                        onClick={() =>
                          updateWorldEditRadius(parsedWorldEdit.radius - 1)
                        }
                        aria-label="Decrease radius"
                        className="flex w-11 shrink-0 items-center justify-center border-r border-white/15 text-[#FFFFFF] transition-colors hover:bg-[#BEF264] hover:text-[#000000]"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        id="worldedit-radius-input"
                        type="number"
                        min={1}
                        max={100}
                        value={parsedWorldEdit.radius}
                        onChange={(e) =>
                          updateWorldEditRadius(Number(e.target.value) || 1)
                        }
                        className="w-full min-w-0 bg-transparent px-2 text-center font-mono text-sm font-semibold tabular-nums text-[#BEF264] focus:bg-[#000000] focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateWorldEditRadius(parsedWorldEdit.radius + 1)
                        }
                        aria-label="Increase radius"
                        className="flex w-11 shrink-0 items-center justify-center border-l border-white/15 text-[#FFFFFF] transition-colors hover:bg-[#BEF264] hover:text-[#000000]"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* WorldEdit Node ID Dropdown */}
                  <div className="sm:col-span-7">
                    <label
                      htmlFor="worldedit-node-select"
                      className="mb-1.5 block text-xs font-medium text-white/70"
                    >
                      Node ID
                    </label>
                    <NodeDropdown
                      id="worldedit-node-select"
                      value={parsedWorldEdit.nodePart}
                      onChange={updateWorldEditNode}
                      placeholder="default:stonebrick"
                    />
                  </div>
                </div>

                {/* Synchronized raw #worldedit-params field */}
                <div>
                  <label
                    htmlFor="worldedit-params"
                    className="mb-1.5 block text-xs font-medium text-white/70"
                  >
                    Combined Parameter String
                  </label>
                  <input
                    id="worldedit-params"
                    type="text"
                    value={worldedit.params}
                    onChange={(e) =>
                      setWorldedit((prev) => ({ ...prev, params: e.target.value }))
                    }
                    placeholder="6 default:stonebrick"
                    className="h-11 w-full rounded-lg border border-white/20 bg-white/[0.04] px-3.5 font-mono text-sm text-[#FFFFFF] placeholder:text-white/40 transition-colors focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none"
                  />
                </div>
              </div>

              {/* WorldEdit Modifiers (#worldedit-modifiers) */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label
                    htmlFor="worldedit-modifiers"
                    className="text-sm font-medium text-[#FFFFFF]"
                  >
                    Command Flags
                  </label>
                  {worldedit.modifiers && (
                    <button
                      type="button"
                      onClick={() =>
                        setWorldedit((prev) => ({ ...prev, modifiers: '' }))
                      }
                      className="text-xs text-white/60 transition-colors hover:text-[#BEF264]"
                    >
                      Clear flags
                    </button>
                  )}
                </div>

                <input
                  id="worldedit-modifiers"
                  type="text"
                  value={worldedit.modifiers}
                  onChange={(e) =>
                    setWorldedit((prev) => ({
                      ...prev,
                      modifiers: e.target.value,
                    }))
                  }
                  placeholder="-h -p"
                  className="mb-3 h-11 w-full rounded-lg border border-white/20 bg-white/[0.04] px-3.5 font-mono text-sm text-[#FFFFFF] placeholder:text-white/40 transition-colors focus:border-[#BEF264] focus:bg-[#000000] focus:outline-none"
                />

                <div className="flex flex-wrap gap-2">
                  {WORLDEDIT_MODIFIER_FLAGS.map((mod) => {
                    const active = hasFlagToken(worldedit.modifiers, mod.flag);
                    return (
                      <button
                        key={mod.flag}
                        type="button"
                        title={mod.hint}
                        onClick={() =>
                          setWorldedit((prev) => ({
                            ...prev,
                            modifiers: toggleFlagToken(prev.modifiers, mod.flag),
                          }))
                        }
                        className={`min-h-[38px] whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                          active
                            ? 'border-[#BEF264] bg-[#BEF264] text-[#000000]'
                            : 'border-white/15 bg-white/[0.03] text-white/80 hover:border-white/40 hover:text-[#FFFFFF]'
                        }`}
                      >
                        <span className="font-mono font-semibold">{mod.flag}</span>
                        <span className="ml-1.5 opacity-80">
                          {mod.label.replace(mod.flag, '').trim()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Command Output + Isometric Voxel Visualizer */}
          <div className="space-y-6 lg:col-span-5">
            {/* Generated Command Output Card */}
            <div
              className={`rounded-xl border border-[#BEF264]/45 bg-[#000000]/80 p-5 backdrop-blur-md transition-shadow ${
                flashCommand ? 'animate-command-flash' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-[#BEF264]" />
                  <h2 className="text-sm font-semibold text-[#FFFFFF]">
                    Generated Chat Command
                  </h2>
                </div>
                <span className="font-mono text-xs tabular-nums text-white/60">
                  {generatedCommand.length} chars
                </span>
              </div>

              {/* #command-display */}
              <div className="mt-4 rounded-lg border border-white/15 bg-white/[0.04] p-4">
                <pre
                  id="command-display"
                  className="min-h-[56px] whitespace-pre-wrap break-all font-mono text-sm leading-relaxed text-[#BEF264] sm:text-[15px]"
                >
                  {generatedCommand}
                </pre>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  id="copy-btn"
                  type="button"
                  onClick={() => handleCopyCommand()}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#BEF264] px-4 py-2 text-sm font-semibold text-[#000000] transition-all duration-150 hover:bg-[#FFFFFF] active:scale-[0.98]"
                >
                  {copiedRecently ? (
                    <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                  ) : (
                    <Copy className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                  )}
                  <span>{copiedRecently ? 'Copied' : 'Copy Command'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveHistory}
                  title="Save command to history"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/20 bg-transparent px-3.5 py-2 text-sm font-medium text-[#FFFFFF] transition-colors hover:border-[#BEF264] hover:text-[#BEF264]"
                >
                  <BookmarkPlus className="h-4 w-4 shrink-0" />
                  <span>Save</span>
                </button>

                <button
                  id="reset-btn"
                  type="button"
                  onClick={handleReset}
                  title="Reset active mode parameters"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/20 bg-transparent px-3.5 py-2 text-sm font-medium text-white/75 transition-colors hover:border-[#FFFFFF] hover:text-[#FFFFFF]"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" />
                  <span>Reset</span>
                </button>
              </div>

              <p className="mt-3 text-xs text-white/55">
                Paste directly into the Luanti / Minetest in-game chat bar while holding your brush tool.
              </p>
            </div>

            {/* Command History */}
            <div id="history" className="rounded-xl border border-white/15 bg-[#000000]/80 p-5 backdrop-blur-md">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#FFFFFF]">
                    Command History
                  </h2>
                  <p className="mt-0.5 text-xs text-white/60">
                    Recent copied or saved brush commands.
                  </p>
                </div>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setHistory([]);
                      showToast('Command history cleared');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:border-[#FFFFFF] hover:text-[#FFFFFF]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Terminal className="h-6 w-6 text-white/40" />
                  <p className="mt-3 text-sm font-medium text-[#FFFFFF]">
                    No saved commands yet
                  </p>
                  <p className="mt-1 max-w-xs text-xs text-white/60">
                    Copy or save any generated command above to keep quick presets handy for your session.
                  </p>
                </div>
              ) : (
                <ul className="max-h-[260px] divide-y divide-white/10 overflow-y-auto pr-1">
                  {history.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-[#BEF264]">
                          {entry.command}
                        </p>
                        <p className="mt-0.5 text-[11px] text-white/55">
                          <span className="capitalize">{entry.mode}</span>
                          <span aria-hidden="true"> · </span>
                          <span className="tabular-nums">{entry.timestamp}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyCommand(entry.command)}
                        aria-label={`Copy ${entry.command}`}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/15 px-2.5 text-xs font-medium text-[#FFFFFF] transition-colors hover:border-[#BEF264] hover:text-[#BEF264]"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Copy</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Quick Presets Section */}
        <section id="presets" className="mt-12 border-t border-white/15 pt-10">
          <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[#FFFFFF]">
                02. Quick Brush Presets
              </h2>
              <p className="mt-1 text-sm text-white/65">
                Load tested terrain sculpting, excavation, and architectural templates in one click.
              </p>
            </div>
            <span className="text-xs text-white/55">
              {BRUSH_PRESETS.length} ready templates
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BRUSH_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="group flex flex-col justify-between rounded-xl border border-white/15 bg-[#000000]/80 p-4 text-left backdrop-blur-md transition-all duration-150 hover:-translate-y-0.5 hover:border-[#BEF264] hover:bg-white/[0.04]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04] transition-colors group-hover:border-[#BEF264]/60">
                      <PresetVectorIcon iconKey={preset.iconKey} className="h-5 w-5" />
                    </span>
                    <span className="text-xs font-medium text-white/55">
                      {preset.category}
                      <span aria-hidden="true"> · </span>
                      <span className="capitalize text-[#BEF264]">{preset.mode}</span>
                    </span>
                  </div>
                  <h3 className="mt-3.5 text-sm font-semibold text-[#FFFFFF] group-hover:text-[#BEF264]">
                    {preset.name}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-white/65">
                    {preset.description}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-xs font-medium text-white/75 group-hover:text-[#BEF264]">
                  <span>Apply preset</span>
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
