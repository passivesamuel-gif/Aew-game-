import type { CameraPreset } from './types';

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'hard-cam',
    label: 'Hard Cam',
    position: [13.2, 6.4, 11.4],
    target: [0, 2.2, -3.5],
    fov: 46,
    shortcut: '1',
  },
  {
    id: 'ringside',
    label: 'Ringside',
    position: [-5.6, 1.85, 5.8],
    target: [0.3, 1.9, -2.0],
    fov: 50,
    shortcut: '2',
  },
  {
    id: 'entrance-stage',
    label: 'Entrance Stage',
    position: [0.0, 3.6, -19.2],
    target: [0, 1.5, 0],
    fov: 52,
    shortcut: '3',
  },
  {
    id: 'arena-wide',
    label: 'Arena Wide',
    position: [26.5, 16.5, 24.0],
    target: [0, 3.2, -4.5],
    fov: 48,
    shortcut: '4',
  },
  {
    id: 'overhead',
    label: 'Overhead',
    position: [0.0, 24.5, 2.5],
    target: [0, 0.5, -5.0],
    fov: 54,
    shortcut: '5',
  },
  {
    id: 'announce-desk',
    label: 'Announce Desk',
    position: [8.4, 2.35, 3.2],
    target: [-0.5, 1.7, -1.2],
    fov: 48,
    shortcut: '6',
  },
];
