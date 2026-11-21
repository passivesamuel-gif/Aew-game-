import type { ShowThemeConfig, ShowThemeId } from './types';

export const SHOW_THEMES: Record<ShowThemeId, ShowThemeConfig> = {
  'apex-prime': {
    id: 'apex-prime',
    label: 'Dynamite Prime',
    eventTitle: 'AEW DYNAMITE',
    eventSubtitle: 'ALL ELITE ARENA',
    primaryHex: '#2563eb',
    secondaryHex: '#f59e0b',
    accentHex: '#fef3c7',
    ropeColors: [0x111318, 0x111318, 0x111318],
    turnbuckleColor: 0x111318,
    canvasAccentHex: '#1d4ed8',
    spotColorA: 0x3b82f6,
    spotColorB: 0xf43f5e,
  },
  'electric-voltage': {
    id: 'electric-voltage',
    label: 'Electric Blue',
    eventTitle: 'AEW DYNAMITE',
    eventSubtitle: 'ALL ELITE ARENA',
    primaryHex: '#2563eb',
    secondaryHex: '#38bdf8',
    accentHex: '#e0f2fe',
    ropeColors: [0x1d4ed8, 0xf3f4f6, 0xdc2626],
    turnbuckleColor: 0x172554,
    canvasAccentHex: '#1d4ed8',
    spotColorA: 0x3b82f6,
    spotColorB: 0x06b6d4,
  },
  'championship-gold': {
    id: 'championship-gold',
    label: 'Gold Edition',
    eventTitle: 'AEW DYNAMITE',
    eventSubtitle: 'ALL ELITE ARENA',
    primaryHex: '#d97706',
    secondaryHex: '#facc15',
    accentHex: '#fef9c3',
    ropeColors: [0x18181b, 0xd4af37, 0x18181b],
    turnbuckleColor: 0x111113,
    canvasAccentHex: '#b45309',
    spotColorA: 0xf59e0b,
    spotColorB: 0xfef08a,
  },
};

export const THEME_ORDER: ShowThemeId[] = [
  'apex-prime',
  'electric-voltage',
  'championship-gold',
];
