export type CameraPresetId =
  | 'hard-cam'
  | 'ringside'
  | 'entrance-stage'
  | 'arena-wide'
  | 'overhead'
  | 'announce-desk';

export type ShowThemeId = 'apex-prime' | 'electric-voltage' | 'championship-gold';

export type LightingMode = 'broadcast' | 'entrance' | 'house';

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  shortcut: string;
}

export interface ShowThemeConfig {
  id: ShowThemeId;
  label: string;
  eventTitle: string;
  eventSubtitle: string;
  primaryHex: string;
  secondaryHex: string;
  accentHex: string;
  ropeColors: [number, number, number]; // top, middle, bottom
  turnbuckleColor: number;
  canvasAccentHex: string;
  spotColorA: number;
  spotColorB: number;
}
