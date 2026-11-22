/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArenaEngine } from './arena/ArenaEngine';
import type { WrestlerHudSnapshot } from './arena/wrestlerController';
import { BroadcastHUD } from './components/BroadcastHUD';
import { MobileController } from './components/MobileController';
import { WRESTLER_ASSET_MANIFEST, type WrestlerId } from './assets/assetManifest';

const INITIAL_WRESTLER_HUD: WrestlerHudSnapshot = {
  matchPhase: 'entrance-rival',
  playerName: 'MJF',
  rivalName: 'WILL OSPREAY',
  entranceName: 'VORTEX',
  entranceSubtitle: 'THE BLUEPRINT · CHALLENGING TONIGHT',
  pinCount: 0,
  winnerName: null,
  playerHp: 100,
  playerStamina: 100,
  playerMomentum: 0,
  rivalHp: 100,
  rivalStamina: 100,
  rivalMomentum: 0,
  playerSurface: 'stage',
  inRing: false,
  isSprinting: false,
  lastMoveBanner: null,
  actions: {
    attack: { visible: false, label: 'Strike' },
    grapple: { visible: false, label: 'Grapple' },
    whip: { visible: false, label: 'Whip' },
    pin: { visible: false, label: 'Pin' },
    reverse: { visible: false, label: 'Reverse' },
    climb: { visible: false, label: 'Climb' },
    dive: { visible: false, label: 'Dive' },
    finisher: { visible: false, label: 'Finisher' },
    run: { visible: false, label: 'Run' },
  },
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const userMutedRef = useRef(false);
  const audioUnlockedRef = useRef(false);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [wrestlerHud, setWrestlerHud] = useState<WrestlerHudSnapshot>(INITIAL_WRESTLER_HUD);
  const [selectedWrestler, setSelectedWrestler] = useState<WrestlerId>('MJF');
  const [matchStarted, setMatchStarted] = useState(false);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new ArenaEngine(
      container,
      'apex-prime',
      (lost) => setContextLost(lost),
      (snap) => setWrestlerHud(snap),
    );
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const ensureAudioOnGesture = useCallback(() => {
    if (audioUnlockedRef.current || userMutedRef.current) return;
    const engine = engineRef.current;
    if (!engine) return;
    audioUnlockedRef.current = true;
    const enabled = engine.unlockAudio();
    setAudioEnabled(enabled);
    const phase = engine.getHudSnapshot().matchPhase;
    if (phase === 'entrance-rival') {
      engine.audio.startEntranceTheme('rival');
    } else if (phase === 'entrance-player') {
      engine.audio.startEntranceTheme('challenger');
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      ensureAudioOnGesture();
      const engine = engineRef.current;
      if (!engine) return;

      const k = e.key.toLowerCase();
      if (k === 'j') engine.triggerAttack();
      else if (k === 'k') engine.triggerGrapple();
      else if (k === 'l' || k === 'e') engine.triggerWhipOrTraversal();
      else if (k === 'p') engine.triggerPin();
      else if (k === 'o') engine.triggerReverse();
      else if (k === 'u') engine.triggerClimbCorner();
      else if (k === 'i') engine.triggerDive();
      else if (k === 'f') engine.triggerFinisher();
      else if (k === ' ') {
        const phase = engine.getHudSnapshot().matchPhase;
        if (phase === 'entrance-rival' || phase === 'entrance-player') {
          e.preventDefault();
          engine.skipEntrance();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ensureAudioOnGesture]);

  const handleToggleAudio = () => {
    const engine = engineRef.current;
    if (!engine) return;
    audioUnlockedRef.current = true;
    const enabled = engine.audio.toggle();
    userMutedRef.current = !enabled;
    setAudioEnabled(enabled);
    if (enabled) {
      const phase = engine.getHudSnapshot().matchPhase;
      if (phase === 'entrance-rival') engine.audio.startEntranceTheme('rival');
      else if (phase === 'entrance-player') engine.audio.startEntranceTheme('challenger');
    }
  };

  const handleSkipEntrance = () => {
    ensureAudioOnGesture();
    engineRef.current?.skipEntrance();
  };

  const handleRematch = () => {
    ensureAudioOnGesture();
    engineRef.current?.restartMatch();
  };

  const handleStartMatch = () => {
    const player = WRESTLER_ASSET_MANIFEST[selectedWrestler];
    const rival = WRESTLER_ASSET_MANIFEST[selectedWrestler === 'MJF' ? 'Ospreay' : 'MJF'];
    ensureAudioOnGesture();
    engineRef.current?.setWrestlerIdentities(player.displayName, rival.displayName, player.id, rival.id);
    engineRef.current?.restartMatch();
    setMatchStarted(true);
  };

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-[#05070c] touch-none select-none"
      onPointerDown={ensureAudioOnGesture}
    >
      {/* Isolated WebGL mount container */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 h-full w-full touch-none"
        aria-label="3D Professional Wrestling Arena Viewport"
      />

      {contextLost && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#05070c]/95 text-center p-6">
          <div>
            <p className="font-broadcast text-xl uppercase tracking-wider text-slate-100">
              Restoring Arena Renderer
            </p>
            <p className="mt-2 text-sm text-slate-400">
              WebGL context interrupted. Reloading graphics pipeline.
            </p>
          </div>
        </div>
      )}

      {matchStarted && (
        <>
          <BroadcastHUD
            audioEnabled={audioEnabled}
            wrestlerHud={wrestlerHud}
            onToggleAudio={handleToggleAudio}
            onSkipEntrance={handleSkipEntrance}
            onRematch={handleRematch}
          />

          <MobileController
            wrestlerHud={wrestlerHud}
            onJoystickMove={(x, z, sprint) => engineRef.current?.setJoystickInput(x, z, sprint)}
            onRunChange={(held) => engineRef.current?.setRunButtonHeld(held)}
            onAttack={() => engineRef.current?.triggerAttack()}
            onGrapple={() => engineRef.current?.triggerGrapple()}
            onWhip={() => engineRef.current?.triggerWhipOrTraversal()}
            onPin={() => engineRef.current?.triggerPin()}
            onReverse={() => engineRef.current?.triggerReverse()}
            onClimb={() => engineRef.current?.triggerClimbCorner()}
            onDive={() => engineRef.current?.triggerDive()}
            onFinisher={() => engineRef.current?.triggerFinisher()}
            onUserGesture={ensureAudioOnGesture}
          />
        </>
      )}

      {!matchStarted && (
        <section className="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-[#05070c]/72 p-5 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-[#0b0f19]/95 p-6 shadow-2xl sm:p-8">
            <p className="font-broadcast text-xs font-bold tracking-[0.3em] text-amber-300 uppercase">Apex Prime · Match Setup</p>
            <h1 className="mt-2 font-broadcast text-4xl font-black tracking-wider text-white uppercase sm:text-5xl">Choose your wrestler</h1>
            <p className="mt-2 max-w-lg text-sm text-slate-400">Select an identity for the challenger. Existing arena and controller systems stay in place while the chosen name carries into entrances and HUD.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {(Object.keys(WRESTLER_ASSET_MANIFEST) as WrestlerId[]).map((id) => {
                const wrestler = WRESTLER_ASSET_MANIFEST[id];
                const selected = selectedWrestler === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedWrestler(id)}
                    className={`rounded-xl border p-4 text-left transition ${selected ? 'border-amber-300 bg-amber-300/10 shadow-[0_0_24px_rgba(251,191,36,0.14)]' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'}`}
                  >
                    <span className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">{selected ? 'Selected' : 'Challenger'}</span>
                    <span className="mt-1 block font-broadcast text-2xl font-black tracking-wider text-white uppercase">{wrestler.displayName}</span>
                    <span className="mt-2 block text-xs text-slate-400">Asset manifest: {wrestler.assetPath}</span>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={handleStartMatch} className="mt-6 h-12 w-full rounded-lg bg-amber-400 px-5 font-broadcast text-sm font-black tracking-[0.18em] text-slate-950 uppercase transition hover:bg-amber-300 active:scale-[0.99]">Enter the arena</button>
            <p className="mt-3 text-center text-[11px] text-slate-500">Supplied GLB visuals load in the background; if a file fails, the existing procedural rig remains active.</p>
          </div>
        </section>
      )}
    </main>
  );
}
