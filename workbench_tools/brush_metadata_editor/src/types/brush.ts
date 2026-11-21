export type BrushMode = 'terraform' | 'worldedit';

export type TerraformPrefix = '/brush' | '//brush' | '/terraform';

export interface TerraformState {
  target: string;
  shape: string;
  mask: string;
  customMaskNode: string;
  size: number;
  modifiers: string;
}

export interface WorldEditState {
  command: string;
  params: string;
  shape: string;
  modifiers: string;
}

export interface BrushPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  mode: BrushMode;
  iconKey:
    | 'mountain'
    | 'cavern'
    | 'river'
    | 'dome'
    | 'wall'
    | 'scatter'
    | 'spire'
    | 'shell';
  terraform?: Partial<TerraformState>;
  worldedit?: Partial<WorldEditState>;
}

export interface LuantiNodeItem {
  id: string;
  label: string;
  group: 'Terrain' | 'Stone' | 'Fluid' | 'Structure';
}

export interface CommandHistoryEntry {
  id: string;
  command: string;
  mode: BrushMode;
  timestamp: string;
}

export interface ToastMessage {
  id: number;
  title: string;
  detail?: string;
}
