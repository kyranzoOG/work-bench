export type AssetCategory = 'blocks' | 'items' | 'food' | 'tools' | 'mobs';

export interface TextureLayer {
  filename?: string;
  expression?: string;
}

export interface RawTextures {
  inventory_image?: TextureLayer[] | null;
  tiles?: TextureLayer[] | null;
  texture?: TextureLayer[] | null;
  textures?: TextureLayer[] | null;
  wield_image?: TextureLayer[] | null;
}

export interface RawAssetEntry {
  id: string;
  name: string;
  mod_origin?: string | null;
  type?: string | null;
  groups?: Record<string, number> | string[] | null;
  textures?: RawTextures | null;
  hp_max?: number | null;
  physical?: boolean | null;
}

export interface AssetEntry {
  uid: string;
  id: string;
  rawName: string;
  displayName: string;
  shortDescription: string;
  category: AssetCategory;
  modOrigin: string;
  type: string;
  groups: Record<string, number> | null;
  groupNames: string[];
  textures: RawTextures | null;
  hpMax: number | null;
  physical: boolean | null;
  isDuplicateName: boolean;
}

export interface TextureFieldDisplay {
  label: string;
  layers: TextureLayer[];
}

export type SortMode = 'name-asc' | 'name-desc' | 'mod-asc';
