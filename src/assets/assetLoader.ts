import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export interface LoadedAssetResult {
  ok: true;
  url: string;
  gltf: GLTF;
}

export interface MissingAssetResult {
  ok: false;
  url: string;
  error: Error;
}

export type AssetLoadResult = LoadedAssetResult | MissingAssetResult;

/**
 * Loads a supplied GLB when it is available. Missing files and network errors
 * are returned as data so callers can keep the arena running safely.
 */
export async function loadGltfAsset(
  url: string,
  loader: GLTFLoader = new GLTFLoader(),
): Promise<AssetLoadResult> {
  try {
    const gltf = await loader.loadAsync(url);
    return { ok: true, url, gltf };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    console.warn(`[asset-loader] Unavailable GLB: ${url}`, error);
    return { ok: false, url, error };
  }
}
