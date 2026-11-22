export type WrestlerId = 'MJF' | 'Ospreay';

export interface WrestlerAssetDefinition {
  id: WrestlerId;
  displayName: string;
  assetPath: string;
}

export interface RefereeAssetDefinition {
  id: 'referee';
  displayName: string;
  assetPath: string;
}

/** Supplied asset locations. Files are intentionally not bundled or substituted here. */
export const WRESTLER_ASSET_MANIFEST: Record<WrestlerId, WrestlerAssetDefinition> = {
  MJF: {
    id: 'MJF',
    displayName: 'MJF',
    assetPath: '/assets/wrestlers/MJF_Wrestler_Animated_HQ.glb',
  },
  Ospreay: {
    id: 'Ospreay',
    displayName: 'Will Ospreay',
    assetPath: '/assets/wrestlers/Ospreay_Wrestler_Animated_HQ.glb',
  },
};

export const REFEREE_ASSET_MANIFEST: RefereeAssetDefinition = {
  id: 'referee',
  displayName: 'Daniel Brooks',
  assetPath: '/assets/referee/daniel_brooks_referee.glb',
};

export const ASSET_MANIFEST = {
  wrestlers: WRESTLER_ASSET_MANIFEST,
  referee: REFEREE_ASSET_MANIFEST,
} as const;
