/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArenaEngine } from './arena/ArenaEngine';
import type { WrestlerHudSnapshot } from './arena/wrestlerController';
import { BroadcastHUD } from './components/BroadcastHUD';
import { MobileController } from './components/MobileController';

const INITIAL_WRESTLER_HUD: WrestlerHudSnapshot = {
  matchPhase: 'entrance-rival',
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
    </main>
  );
}
