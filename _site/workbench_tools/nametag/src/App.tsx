import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Info,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { AssetModal } from './components/AssetModal';
import { CustomSelect, type SelectOption } from './components/CustomSelect';
import { LogoSlot } from './components/LogoSlot';
import type { AssetCategory, AssetEntry, RawAssetEntry, SortMode } from './types/asset';
import {
  getSearchMatchRank,
  matchesAssetSearch,
  normalizeAssetEntry,
} from './utils/formatters';
import blocksJson from '../data/blocks.json';
import itemsJson from '../data/items.json';
import foodJson from '../data/food.json';
import toolsJson from '../data/tools.json';
import mobsJson from '../data/mobs.json';

const CATEGORIES: { key: AssetCategory; label: string }[] = [
  { key: 'blocks', label: 'Blocks' },
  { key: 'items', label: 'Items' },
  { key: 'food', label: 'Food' },
  { key: 'tools', label: 'Tools' },
  { key: 'mobs', label: 'Mobs' },
];

type RawDatasetPayload =
  | RawAssetEntry[]
  | { entries?: RawAssetEntry[] }
  | null
  | undefined;

const BUNDLED_DATASETS: Record<AssetCategory, RawDatasetPayload> = {
  blocks: blocksJson as unknown as RawDatasetPayload,
  items: itemsJson as unknown as RawDatasetPayload,
  food: foodJson as unknown as RawDatasetPayload,
  tools: toolsJson as unknown as RawDatasetPayload,
  mobs: mobsJson as unknown as RawDatasetPayload,
};

function normalizeDatasetEntries(
  json: RawDatasetPayload,
  key: AssetCategory
): AssetEntry[] {
  const rawEntries: RawAssetEntry[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.entries)
      ? json.entries
      : [];

  const normalized = rawEntries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, idx) => normalizeAssetEntry(entry, key, idx));

  const nameCounts = new Map<string, number>();
  for (const item of normalized) {
    const lower = item.displayName.toLowerCase();
    nameCounts.set(lower, (nameCounts.get(lower) || 0) + 1);
  }
  for (const item of normalized) {
    if ((nameCounts.get(item.displayName.toLowerCase()) || 0) > 1) {
      item.isDuplicateName = true;
    }
  }

  return normalized;
}

function buildBundledDatasets(): Record<AssetCategory, AssetEntry[]> {
  return {
    blocks: normalizeDatasetEntries(BUNDLED_DATASETS.blocks, 'blocks'),
    items: normalizeDatasetEntries(BUNDLED_DATASETS.items, 'items'),
    food: normalizeDatasetEntries(BUNDLED_DATASETS.food, 'food'),
    tools: normalizeDatasetEntries(BUNDLED_DATASETS.tools, 'tools'),
    mobs: normalizeDatasetEntries(BUNDLED_DATASETS.mobs, 'mobs'),
  };
}

const INITIAL_BATCH_SIZE = 48;
const BATCH_INCREMENT = 48;

const SORT_OPTIONS: SelectOption[] = [
  { value: 'name-asc', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'mod-asc', label: 'By Mod' },
];

export default function App() {
  const [assetsByCategory, setAssetsByCategory] = useState<
    Record<AssetCategory, AssetEntry[]>
  >(() => buildBundledDatasets());
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeCategory, setActiveCategory] = useState<AssetCategory>('blocks');
  const [searchScope, setSearchScope] = useState<'all' | AssetCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMod, setSelectedMod] = useState<string>('all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [displayLimit, setDisplayLimit] = useState(INITIAL_BATCH_SIZE);
  const [selectedEntry, setSelectedEntry] = useState<AssetEntry | null>(null);

  const glowRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Smooth viewport-relative mouse-following pistachio glow
  useEffect(() => {
    let rafId = 0;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 3;

    const updatePosition = () => {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${targetX - 280}px, ${targetY - 280}px, 0)`;
      }
      rafId = 0;
    };

    const handlePointerMove = (e: PointerEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
      if (!rafId) {
        rafId = window.requestAnimationFrame(updatePosition);
      }
    };

    updatePosition();
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  // Refresh in background from ./data/*.json if reachable at runtime
  useEffect(() => {
    let cancelled = false;

    async function fetchCategoryJson(
      key: AssetCategory
    ): Promise<RawDatasetPayload | null> {
      const candidatePaths = [`./data/${key}.json`, `./public/data/${key}.json`];
      for (const candidate of candidatePaths) {
        try {
          const res = await fetch(candidate, {
            credentials: 'same-origin',
            cache: 'no-cache',
          });
          if (!res.ok) continue;
          const json = (await res.json()) as RawDatasetPayload;
          if (Array.isArray(json) || Array.isArray(json?.entries)) {
            return json;
          }
        } catch {
          // Keep bundled ../data/*.json dataset if runtime fetch is blocked
        }
      }
      return null;
    }

    async function refreshDatasetsFromDataFolder() {
      const results = await Promise.all(
        CATEGORIES.map(async ({ key }) => {
          const json = await fetchCategoryJson(key);
          return json ? ([key, normalizeDatasetEntries(json, key)] as const) : null;
        })
      );

      if (cancelled) return;

      const updated: Partial<Record<AssetCategory, AssetEntry[]>> = {};
      let hasUpdates = false;
      for (const item of results) {
        if (item && item[1].length > 0) {
          updated[item[0]] = item[1];
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        setAssetsByCategory((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const key of Object.keys(updated) as AssetCategory[]) {
            const incoming = updated[key];
            const current = prev[key];
            if (
              incoming &&
              (incoming.length !== current.length ||
                incoming[0]?.id !== current[0]?.id ||
                incoming[incoming.length - 1]?.id !== current[current.length - 1]?.id)
            ) {
              next[key] = incoming;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      setLoadError(null);
      setIsLoading(false);
    }

    refreshDatasetsFromDataFolder();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmedQuery = searchQuery.trim();
  const isSearching = trimmedQuery.length > 0;

  // Handle typing in the search bar: search across all categories by default
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchScope('all');
    setDisplayLimit(INITIAL_BATCH_SIZE);
  };

  // Switch category tabs (or toggle category filter while searching)
  const handleSelectCategory = (category: AssetCategory) => {
    if (isSearching) {
      setSearchScope((prev) => (prev === category ? 'all' : category));
      setActiveCategory(category);
      setSelectedMod('all');
      setSelectedGroup('all');
      setDisplayLimit(INITIAL_BATCH_SIZE);
      return;
    }
    setActiveCategory(category);
    setSearchScope('all');
    setSelectedMod('all');
    setSelectedGroup('all');
    setDisplayLimit(INITIAL_BATCH_SIZE);
  };

  useEffect(() => {
    setDisplayLimit(INITIAL_BATCH_SIZE);
  }, [searchQuery, searchScope, selectedMod, selectedGroup, sortMode]);

  // Pre-compute search matches per category (matching strictly name or string/ID)
  const searchMatchesByCategory = useMemo(() => {
    if (!isSearching) return null;
    return {
      blocks: assetsByCategory.blocks.filter((item) => matchesAssetSearch(item, trimmedQuery)),
      items: assetsByCategory.items.filter((item) => matchesAssetSearch(item, trimmedQuery)),
      food: assetsByCategory.food.filter((item) => matchesAssetSearch(item, trimmedQuery)),
      tools: assetsByCategory.tools.filter((item) => matchesAssetSearch(item, trimmedQuery)),
      mobs: assetsByCategory.mobs.filter((item) => matchesAssetSearch(item, trimmedQuery)),
    };
  }, [assetsByCategory, isSearching, trimmedQuery]);

  // Base entries for active view (global search pool when searching, otherwise active category)
  const scopedEntries = useMemo(() => {
    if (isSearching && searchMatchesByCategory) {
      if (searchScope === 'all') {
        return [
          ...searchMatchesByCategory.blocks,
          ...searchMatchesByCategory.items,
          ...searchMatchesByCategory.food,
          ...searchMatchesByCategory.tools,
          ...searchMatchesByCategory.mobs,
        ];
      }
      return searchMatchesByCategory[searchScope];
    }
    return assetsByCategory[activeCategory];
  }, [assetsByCategory, activeCategory, isSearching, searchMatchesByCategory, searchScope]);

  // Distinct mods sorted alphabetically for current scope
  const availableMods = useMemo(() => {
    const modSet = new Set<string>();
    for (const item of scopedEntries) {
      modSet.add(item.modOrigin);
    }
    return Array.from(modSet).sort((a, b) => a.localeCompare(b));
  }, [scopedEntries]);

  // Distinct groups sorted by frequency for current scope
  const availableGroups = useMemo(() => {
    const groupCounts = new Map<string, number>();
    for (const item of scopedEntries) {
      for (const group of item.groupNames) {
        groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
      }
    }
    return Array.from(groupCounts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([group]) => group);
  }, [scopedEntries]);

  const modOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'All Mods' },
      ...availableMods.map((mod) => ({
        value: mod,
        label: mod,
      })),
    ],
    [availableMods]
  );

  const groupOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'all', label: 'All Groups' },
      ...availableGroups.map((group) => ({
        value: group,
        label: group.replace(/_/g, ' '),
      })),
    ],
    [availableGroups]
  );

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    const filtered = scopedEntries.filter((item) => {
      if (selectedMod !== 'all' && item.modOrigin !== selectedMod) {
        return false;
      }
      if (selectedGroup !== 'all' && !item.groupNames.includes(selectedGroup)) {
        return false;
      }
      return true;
    });

    const isAlphaStart = (s: string) => /^[A-Za-z]/.test(s);
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (isSearching) {
        const rankDiff =
          getSearchMatchRank(a, trimmedQuery) - getSearchMatchRank(b, trimmedQuery);
        if (rankDiff !== 0) return rankDiff;
      }

      if (sortMode === 'name-asc') {
        const aAlpha = isAlphaStart(a.displayName);
        const bAlpha = isAlphaStart(b.displayName);
        if (aAlpha !== bAlpha) return aAlpha ? -1 : 1;
        return a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
      }
      if (sortMode === 'name-desc') {
        const aAlpha = isAlphaStart(a.displayName);
        const bAlpha = isAlphaStart(b.displayName);
        if (aAlpha !== bAlpha) return aAlpha ? -1 : 1;
        return b.displayName.localeCompare(a.displayName) || a.id.localeCompare(b.id);
      }
      return a.modOrigin.localeCompare(b.modOrigin) || a.displayName.localeCompare(b.displayName);
    });

    return sorted;
  }, [scopedEntries, selectedMod, selectedGroup, sortMode, isSearching, trimmedQuery]);

  const visibleEntries = useMemo(() => {
    return filteredEntries.slice(0, displayLimit);
  }, [filteredEntries, displayLimit]);

  const hasMoreEntries = visibleEntries.length < filteredEntries.length;

  // Continuous infinite scroll via IntersectionObserver + scroll fallback
  useEffect(() => {
    if (!hasMoreEntries || isLoading) return;

    const loadNextBatch = () => {
      setDisplayLimit((prev) =>
        Math.min(filteredEntries.length, prev + BATCH_INCREMENT)
      );
    };

    const target = loadMoreRef.current;
    let observer: IntersectionObserver | null = null;
    if (target && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            loadNextBatch();
          }
        },
        { rootMargin: '400px 0px' }
      );
      observer.observe(target);
    }

    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 400
      ) {
        loadNextBatch();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [hasMoreEntries, isLoading, filteredEntries.length]);

  const hasActiveFilters =
    isSearching || selectedMod !== 'all' || selectedGroup !== 'all';

  const resetAllFilters = () => {
    setSearchQuery('');
    setSearchScope('all');
    setSelectedMod('all');
    setSelectedGroup('all');
    setDisplayLimit(INITIAL_BATCH_SIZE);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return;
    }
    e.preventDefault();
  };

  return (
    <div
      onContextMenu={handleContextMenu}
      className="min-h-screen w-full max-w-full bg-[#000000] text-neutral-100 relative overflow-x-clip select-none"
    >
      {/* Fixed Pistachio-Green (#BEF264) Background Canvas: Grid Lines + Mega Ambient Glows + Mouse Glow */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#000000]">
        {/* Crisp Pistachio-Green Grid Lines */}
        <div className="absolute inset-0 pistachio-grid-bg" />

        {/* Very Big Pistachio-Green (#BEF264) Background Glows shining behind translucent cards */}
        <div
          className="absolute -top-48 -left-32 w-[820px] h-[820px] rounded-full blur-[110px]"
          style={{
            background:
              'radial-gradient(circle, rgba(190, 242, 100, 0.36) 0%, rgba(190, 242, 100, 0.14) 45%, transparent 72%)',
          }}
        />
        <div
          className="absolute top-[20%] -right-44 w-[900px] h-[900px] rounded-full blur-[120px]"
          style={{
            background:
              'radial-gradient(circle, rgba(190, 242, 100, 0.32) 0%, rgba(190, 242, 100, 0.12) 48%, transparent 75%)',
          }}
        />
        <div
          className="absolute -bottom-56 left-[18%] w-[860px] h-[640px] rounded-full blur-[120px]"
          style={{
            background:
              'radial-gradient(circle, rgba(190, 242, 100, 0.30) 0%, rgba(190, 242, 100, 0.10) 50%, transparent 75%)',
          }}
        />

        {/* Interactive Mouse-Following Pistachio Glow */}
        <div
          ref={glowRef}
          className="mouse-glow absolute top-0 left-0 w-[560px] h-[560px] rounded-full blur-[90px] will-change-transform"
          style={{
            background:
              'radial-gradient(circle, rgba(190, 242, 100, 0.34) 0%, rgba(190, 242, 100, 0.12) 45%, transparent 70%)',
          }}
        />
      </div>

      {/* Sticky Translucent Header */}
      <header className="sticky top-0 z-30 border-b border-[#BEF264]/20 bg-[#000000]/55 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Modular Brand Area */}
          <div className="flex items-center gap-3 shrink-0">
            <LogoSlot />
            <span className="text-lg font-bold tracking-tight text-white whitespace-nowrap">
              Name Tag
            </span>
          </div>

          {/* Desktop 5-Section Navigation */}
          <nav
            aria-label="Asset categories"
            className="hidden lg:flex items-center gap-1 p-1 rounded-xl border border-[#BEF264]/25 bg-[#000000]/50 backdrop-blur-md"
          >
            {CATEGORIES.map(({ key, label }) => {
              const isActive = isSearching
                ? searchScope === key
                : activeCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectCategory(key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEF264] ${
                    isActive
                      ? 'bg-[#BEF264] text-[#000000] font-semibold'
                      : 'text-neutral-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Mobile / Tablet Horizontal Scrollable Category Bar */}
        <div className="lg:hidden border-t border-white/10 bg-[#000000]/45">
          <nav
            aria-label="Mobile asset categories"
            className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar"
          >
            {CATEGORIES.map(({ key, label }) => {
              const isActive = isSearching
                ? searchScope === key
                : activeCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectCategory(key)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-[#BEF264] text-[#000000] font-semibold'
                      : 'border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Search & Filter Toolbar */}
        <section
          aria-label="Search and filters"
          className="relative z-20 rounded-2xl border border-[#BEF264]/25 bg-[#000000]/35 backdrop-blur-md p-3.5 sm:p-4 mb-6 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Live Search Box */}
            <div className="relative md:col-span-6 min-w-0">
              <Search
                className="w-4 h-4 text-[#BEF264] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by name or string..."
                aria-label="Search by name or string"
                className="w-full h-11 rounded-xl border border-white/15 bg-[#000000]/50 pl-10 pr-10 text-sm text-white placeholder-neutral-400 focus:outline-none focus:border-[#BEF264] focus:ring-1 focus:ring-[#BEF264]/50 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Mod Origin Filter */}
            <div className="md:col-span-3 min-w-0">
              <CustomSelect
                value={selectedMod}
                options={modOptions}
                onChange={setSelectedMod}
                ariaLabel="Filter by mod origin"
                align="left"
              />
            </div>

            {/* Group + Sort Controls */}
            <div className="md:col-span-3 grid grid-cols-2 gap-2 min-w-0">
              <CustomSelect
                value={selectedGroup}
                options={groupOptions}
                onChange={setSelectedGroup}
                ariaLabel="Filter by group"
                disabled={availableGroups.length === 0}
                align="left"
              />

              <CustomSelect
                value={sortMode}
                options={SORT_OPTIONS}
                onChange={(val) => setSortMode(val as SortMode)}
                ariaLabel="Sort entries"
                icon={<SlidersHorizontal className="w-3.5 h-3.5 hidden sm:block" />}
                align="right"
              />
            </div>
          </div>

          {/* Quick Group Filter Strip when groups exist */}
          {availableGroups.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedGroup === 'all'
                    ? 'bg-[#BEF264] text-[#000000] font-semibold'
                    : 'border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white'
                }`}
              >
                All
              </button>
              {availableGroups.slice(0, 14).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() =>
                    setSelectedGroup((prev) => (prev === group ? 'all' : group))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    selectedGroup === group
                      ? 'bg-[#BEF264] text-[#000000] font-semibold'
                      : 'border border-white/10 bg-white/[0.04] text-neutral-300 hover:text-white hover:border-[#BEF264]/45'
                  }`}
                >
                  {group.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Active Filter Actions Row */}
        {(hasActiveFilters || (isSearching && searchScope !== 'all')) && (
          <div className="flex flex-wrap items-center justify-end gap-3 mb-4 text-xs">
            {isSearching && searchScope !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setSearchScope('all');
                  setSelectedMod('all');
                  setSelectedGroup('all');
                  setDisplayLimit(INITIAL_BATCH_SIZE);
                }}
                className="text-xs font-medium text-neutral-300 hover:text-[#BEF264] transition-colors cursor-pointer"
              >
                Show all categories
              </button>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="text-xs font-medium text-[#BEF264] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[108px] rounded-lg border border-white/10 border-l-[5px] border-l-[#BEF264]/50 bg-[#000000]/40 backdrop-blur-md p-4 animate-pulse flex flex-col justify-center"
              >
                <div className="space-y-2.5">
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                  <div className="h-3 w-full rounded bg-white/5" />
                  <div className="h-3 w-4/5 rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!isLoading && loadError && (
          <div className="rounded-2xl border border-red-500/30 bg-[#000000]/60 backdrop-blur-md p-8 text-center">
            <Info className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-white">
              Could not load catalog data
            </h2>
            <p className="text-sm text-neutral-400 mt-1">{loadError}</p>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !loadError && filteredEntries.length === 0 && (
          <div className="rounded-2xl border border-[#BEF264]/25 bg-[#000000]/40 backdrop-blur-md p-12 text-center">
            <Info className="w-9 h-9 text-[#BEF264]/80 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-white">
              No matching entries found
            </h2>
            <p className="text-sm text-neutral-400 mt-1">
              Try a different search term or clear your active filters.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-[#BEF264] text-[#000000] text-xs font-semibold hover:bg-[#BEF264]/90 transition-colors cursor-pointer"
              >
                Reset filters
              </button>
            )}
          </div>
        )}

        {/* Translucent Discord-Embed Cards Grid (Clean Display Name + Short Description Only) */}
        {!isLoading && !loadError && visibleEntries.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleEntries.map((entry) => (
                <button
                  key={entry.uid}
                  type="button"
                  onClick={() => setSelectedEntry(entry)}
                  className="group relative text-left rounded-lg border border-white/10 border-l-[5px] border-l-[#BEF264] bg-[#000000]/45 backdrop-blur-md hover:bg-[#000000]/60 hover:border-white/20 hover:border-l-[#BEF264] px-4 py-4 transition-all duration-150 flex flex-col justify-center min-h-[108px] shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:shadow-[0_6px_28px_rgba(0,0,0,0.5),-3px_0_22px_rgba(190,242,100,0.25)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BEF264]"
                >
                  <div className="min-w-0 w-full">
                    <h3 className="text-base font-semibold text-white group-hover:text-[#BEF264] transition-colors line-clamp-1">
                      {entry.displayName}
                    </h3>
                    <p className="text-sm text-neutral-300/85 mt-1.5 line-clamp-2 leading-relaxed">
                      {entry.shortDescription}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Continuous Scroll Sentinel */}
            {hasMoreEntries && (
              <div
                ref={loadMoreRef}
                aria-hidden="true"
                className="h-12 w-full"
              />
            )}
          </>
        )}
      </main>

      {/* Compact Info Modal */}
      <AssetModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
