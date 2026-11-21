import type {
  AssetCategory,
  AssetEntry,
  RawAssetEntry,
  TextureFieldDisplay,
  TextureLayer,
} from '../types/asset';

const CATEGORY_LABELS: Record<AssetCategory, string> = {
  blocks: 'block',
  items: 'item',
  food: 'food',
  tools: 'tool',
  mobs: 'mob',
};

/**
 * Strips Luanti/Minetest escape codes like \u001b(c@gold), \u001b(T@mod), \u001bE, etc.
 */
export function stripEscapeCodes(value: string): string {
  return value
    .replace(/\u001b\([^)]*\)/g, '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/\u001b[A-Za-z]/g, '')
    .replace(/\\u001b\([^)]*\)/g, '')
    .replace(/\\u001b[A-Za-z]/g, '');
}

/**
 * Converts an identifier or snake_case string into a clean human-readable Title Case name.
 */
export function humanizeIdentifier(rawId: string): string {
  const trimmed = rawId.trim();
  if (!trimmed) return 'Unnamed Item';

  const afterColon = trimmed.includes(':') ? trimmed.split(':').slice(1).join(' ') : trimmed;
  const cleaned = afterColon
    .replace(/^_+/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    const fallback = trimmed.replace(/[:_-]+/g, ' ').trim();
    return fallback ? toTitleCase(fallback) : 'Unnamed Item';
  }

  return toTitleCase(cleaned);
}

function toTitleCase(text: string): string {
  return text
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Produces a clean display name and optional clean subtitle lines from raw JSON fields.
 * Guarantees no underscores, colons, or escape sequences remain in the main listing text.
 */
export function extractCleanText(
  rawName: string | null | undefined,
  rawId: string | null | undefined
): { displayName: string; subtitle: string | null } {
  const safeId = typeof rawId === 'string' ? rawId : '';
  const safeName = typeof rawName === 'string' ? stripEscapeCodes(rawName) : '';

  const lines = safeName
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let primary = lines[0] || '';

  // If primary name is still an internal identifier (e.g. "mobs_animal:bear" or "__builtin:item")
  if (!primary || (primary.includes(':') && !primary.includes(' ')) || primary.includes('_')) {
    primary = humanizeIdentifier(primary || safeId);
  }

  // Clean up any stray underscores in display text while preserving natural punctuation
  primary = primary.replace(/_/g, ' ').replace(/\s+/g, ' ').trim() || 'Unnamed Entry';

  const extraLines = lines
    .slice(1)
    .map((line) => line.replace(/_/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0 && !line.includes(':'));

  return {
    displayName: primary,
    subtitle: extraLines.length > 0 ? extraLines.join(' · ') : null,
  };
}

export function buildSimpleDescription(
  displayName: string,
  subtitle: string | null,
  category: AssetCategory
): string {
  if (subtitle) {
    const cleanSub = subtitle.replace(/^\((.*)\)$/, '$1').trim();
    if (cleanSub.length > 0) {
      return `${cleanSub} — ${displayName}.`;
    }
  }

  switch (category) {
    case 'blocks':
      return `Placeable ${displayName} block.`;
    case 'items':
      return `Collectible ${displayName} item.`;
    case 'food':
      return `Consumable ${displayName} food item.`;
    case 'tools':
      return `Usable ${displayName} gear or tool.`;
    case 'mobs':
      return `${displayName} world entity.`;
  }
}

export function normalizeAssetEntry(
  raw: RawAssetEntry,
  category: AssetCategory,
  index: number
): AssetEntry {
  const rawId = typeof raw.id === 'string' ? raw.id : '';
  const { displayName, subtitle } = extractCleanText(raw.name, rawId);
  const shortDescription = buildSimpleDescription(displayName, subtitle, category);

  let normalizedGroups: Record<string, number> | null = null;
  let groupNames: string[] = [];

  if (raw.groups && typeof raw.groups === 'object' && !Array.isArray(raw.groups)) {
    const entries = Object.entries(raw.groups);
    if (entries.length > 0) {
      normalizedGroups = raw.groups;
      groupNames = entries.map(([k]) => k);
    }
  } else if (Array.isArray(raw.groups) && raw.groups.length > 0) {
    normalizedGroups = {};
    groupNames = raw.groups.map(String);
    groupNames.forEach((g) => {
      if (normalizedGroups) normalizedGroups[g] = 1;
    });
  }

  const modOrigin =
    typeof raw.mod_origin === 'string' && raw.mod_origin.trim()
      ? raw.mod_origin.trim()
      : rawId.includes(':')
        ? rawId.split(':')[0]
        : 'unknown';

  const type =
    typeof raw.type === 'string' && raw.type.trim()
      ? raw.type.trim()
      : CATEGORY_LABELS[category];

  const rawName = stripEscapeCodes(typeof raw.name === 'string' ? raw.name : '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    uid: `${category}::${rawId || 'empty'}::${index}`,
    id: rawId,
    rawName,
    displayName,
    shortDescription,
    category,
    modOrigin,
    type,
    groups: normalizedGroups,
    groupNames,
    textures: raw.textures ?? null,
    hpMax: typeof raw.hp_max === 'number' ? raw.hp_max : null,
    physical: typeof raw.physical === 'boolean' ? raw.physical : null,
    isDuplicateName: false,
  };
}

/**
 * Exact texture naming convention requested by user:
 * - Block: block texture
 * - Item: item texture
 * - Armor: armor texture
 * - Tool: tool texture
 * - Food: food texture
 */
export function getTextureConventionLabel(entry: AssetEntry): string {
  const idLower = entry.id.toLowerCase();
  const hasArmorGroup = entry.groupNames.some((g) => {
    const gl = g.toLowerCase();
    return (
      gl.includes('armor') ||
      gl === 'helmet' ||
      gl === 'boots' ||
      gl === 'chestplate' ||
      gl === 'leggings' ||
      gl === 'shield'
    );
  });

  if (
    hasArmorGroup ||
    idLower.includes('armor:') ||
    idLower.includes('helmet') ||
    idLower.includes('boots') ||
    idLower.includes('chestplate') ||
    idLower.includes('leggings') ||
    idLower.includes('shield')
  ) {
    return 'armor texture';
  }

  switch (entry.category) {
    case 'blocks':
      return 'block texture';
    case 'items':
      return 'item texture';
    case 'tools':
      return 'tool texture';
    case 'food':
      return 'food texture';
    case 'mobs':
      return 'mob texture';
  }
}

/**
 * Extracts texture arrays for the Info modal.
 * Preserves Inventory Image AND primary 3D/model/armor/block/item/tool/food textures.
 * Explicitly omits wield_image as requested.
 */
export function getModalTextures(entry: AssetEntry): TextureFieldDisplay[] {
  const tex = entry.textures;
  if (!tex) return [];

  const result: TextureFieldDisplay[] = [];

  const toLayers = (arr: TextureLayer[] | null | undefined): TextureLayer[] =>
    Array.isArray(arr) ? arr.filter((item) => item && (item.filename || item.expression)) : [];

  const invLayers = toLayers(tex.inventory_image);
  if (invLayers.length > 0) {
    result.push({
      label: 'Inventory Image',
      layers: invLayers,
    });
  }

  const modelLayers = [
    ...toLayers(tex.tiles),
    ...toLayers(tex.texture),
    ...toLayers(tex.textures),
  ];

  if (modelLayers.length > 0) {
    result.push({
      label: getTextureConventionLabel(entry),
      layers: modelLayers,
    });
  }

  return result;
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_:/\\.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches an entry strictly by its name (displayName / stripped rawName) or original string (id).
 * Explicitly excludes description and other unrelated fields.
 */
export function matchesAssetSearch(entry: AssetEntry, rawQuery: string): boolean {
  const queryLower = rawQuery.trim().toLowerCase();
  if (!queryLower) return true;

  const displayLower = entry.displayName.toLowerCase();
  const rawNameLower = entry.rawName.toLowerCase();
  const idLower = entry.id.toLowerCase();

  if (
    displayLower.includes(queryLower) ||
    rawNameLower.includes(queryLower) ||
    idLower.includes(queryLower)
  ) {
    return true;
  }

  const normalizedQuery = normalizeForSearch(queryLower);
  if (!normalizedQuery) return false;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;

  const combinedNormalized = [
    normalizeForSearch(entry.displayName),
    normalizeForSearch(entry.rawName),
    normalizeForSearch(entry.id),
  ]
    .filter(Boolean)
    .join(' ');

  return tokens.every((token) => combinedNormalized.includes(token));
}

/**
 * Ranks search results so direct name matches appear before string/ID matches.
 */
export function getSearchMatchRank(entry: AssetEntry, rawQuery: string): number {
  const queryLower = rawQuery.trim().toLowerCase();
  if (!queryLower) return 0;

  const displayLower = entry.displayName.toLowerCase();
  const rawNameLower = entry.rawName.toLowerCase();
  const idLower = entry.id.toLowerCase();

  if (displayLower === queryLower || rawNameLower === queryLower) return 0;
  if (displayLower.startsWith(queryLower) || rawNameLower.startsWith(queryLower)) return 1;
  if (displayLower.includes(queryLower) || rawNameLower.includes(queryLower)) return 2;
  if (idLower.includes(queryLower)) return 3;
  return 4;
}
