import { FastForward, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { WrestlerHudSnapshot } from '../arena/wrestlerController';

interface BroadcastHUDProps {
  audioEnabled: boolean;
  wrestlerHud: WrestlerHudSnapshot;
  onToggleAudio: () => void;
  onSkipEntrance: () => void;
  onRematch: () => void;
}

function HealthColor(hp: number): string {
  if (hp > 55) return 'bg-emerald-400';
  if (hp > 28) return 'bg-amber-400';
  return 'bg-rose-500';
}

export function BroadcastHUD({
  audioEnabled,
  wrestlerHud,
  onToggleAudio,
  onSkipEntrance,
  onRematch,
}: BroadcastHUDProps) {
  const isEntrance =
    wrestlerHud.matchPhase === 'entrance-rival' ||
    wrestlerHud.matchPhase === 'entrance-player';
  const isPinning = wrestlerHud.matchPhase === 'pinning' || wrestlerHud.matchPhase === 'submitting';
  const isFinished = wrestlerHud.matchPhase === 'finished';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5 select-none">
      {/* TOP BROADCAST MATCH STRIP */}
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        {/* Left Fighter: CHALLENGER (Player) */}
        <div className="w-[42%] max-w-[300px] rounded-lg border border-slate-700/75 bg-[#0b0f19]/85 px-2.5 py-2 shadow-xl">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-broadcast text-xs sm:text-sm font-bold tracking-wider text-amber-300 uppercase whitespace-nowrap">
              {wrestlerHud.playerName}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-slate-200 whitespace-nowrap">
              {wrestlerHud.playerHp}%
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-slate-800">
            <div
              className={`h-full transition-all duration-150 ${HealthColor(wrestlerHud.playerHp)}`}
              style={{ width: `${wrestlerHud.playerHp}%` }}
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <div className="h-1 flex-1 overflow-hidden rounded-sm bg-slate-800">
              <div
                className={`h-full transition-all duration-150 ${
                  wrestlerHud.playerMomentum >= 100
                    ? 'bg-yellow-400'
                    : 'bg-sky-400'
                }`}
                style={{ width: `${wrestlerHud.playerMomentum}%` }}
              />
            </div>
            <span
              className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${
                wrestlerHud.playerMomentum >= 100
                  ? 'text-yellow-300'
                  : 'text-sky-300/90'
              }`}
            >
              {wrestlerHud.playerMomentum >= 100
                ? 'FINISHER'
                : `${wrestlerHud.playerMomentum}%`}
            </span>
          </div>
        </div>

        {/* Center Audio Toggle */}
        <button
          type="button"
          onClick={onToggleAudio}
          aria-label={audioEnabled ? 'Mute Arena Audio' : 'Enable Arena Audio'}
          className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-600/80 bg-[#0b0f19]/88 text-slate-100 shadow-lg transition-transform active:scale-90 hover:border-slate-400"
        >
          {audioEnabled ? (
            <Volume2 className="h-5 w-5 text-amber-300" />
          ) : (
            <VolumeX className="h-5 w-5 text-slate-400" />
          )}
        </button>

        {/* Right Fighter: VORTEX (Rival) */}
        <div className="w-[42%] max-w-[300px] rounded-lg border border-slate-700/75 bg-[#0b0f19]/85 px-2.5 py-2 shadow-xl">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-semibold tabular-nums text-slate-200 whitespace-nowrap">
              {wrestlerHud.rivalHp}%
            </span>
            <span className="font-broadcast text-xs sm:text-sm font-bold tracking-wider text-sky-300 uppercase whitespace-nowrap">
              {wrestlerHud.rivalName}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-sm bg-slate-800">
            <div
              className={`ml-auto h-full transition-all duration-150 ${HealthColor(wrestlerHud.rivalHp)}`}
              style={{ width: `${wrestlerHud.rivalHp}%` }}
            />
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] font-bold tabular-nums text-sky-300/90 whitespace-nowrap">
              {wrestlerHud.rivalMomentum}%
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-sm bg-slate-800">
              <div
                className="ml-auto h-full bg-indigo-400 transition-all duration-150"
                style={{ width: `${wrestlerHud.rivalMomentum}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* MOVE CALLOUT BANNER (brief crisp broadcast strip) */}
      {wrestlerHud.lastMoveBanner && !isEntrance && !isFinished && (
        <div className="pointer-events-none absolute top-[76px] sm:top-[84px] left-1/2 -translate-x-1/2">
          <div className="rounded-md border border-amber-400/70 bg-[#0b0f19]/90 px-4 py-1 text-center font-broadcast text-xs sm:text-sm font-bold tracking-widest text-amber-300 uppercase shadow-lg whitespace-nowrap">
            {wrestlerHud.lastMoveBanner}
          </div>
        </div>
      )}

      {wrestlerHud.outsideCount > 0 && !isFinished && (
        <div className="pointer-events-none absolute top-[112px] left-1/2 -translate-x-1/2 rounded-md border border-rose-400/70 bg-[#0b0f19]/90 px-4 py-1 font-broadcast text-xs font-black tracking-[0.18em] text-rose-300 uppercase shadow-lg">
          Referee count · {wrestlerHud.outsideCount}/10
        </div>
      )}

      {!isEntrance && !isFinished && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 hidden -translate-x-1/2 rounded-lg border border-slate-700/70 bg-[#0b0f19]/80 px-3 py-2 text-[10px] text-slate-300 shadow-xl sm:block">
          <div className="flex items-center gap-3 whitespace-nowrap font-semibold uppercase tracking-wider">
            <span className="text-slate-500">Actions</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">WASD</kbd> Move</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">J</kbd> Strike</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">K</kbd> Grapple</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">B</kbd> Submit</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">O</kbd> Reverse</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">F</kbd> Finisher</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">V</kbd> Camera</span>
            <span><kbd className="rounded border border-slate-600 px-1 text-amber-300">Esc</kbd> Pause</span>
          </div>
        </div>
      )}

      {/* PINFALL REFEREE COUNT OVERLAY */}
  {isPinning && wrestlerHud.pinCount > 0 && (
        <div className="pointer-events-none flex flex-col items-center justify-center">
          <div className="font-broadcast text-6xl sm:text-7xl font-black tracking-tight text-amber-300 drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)]">
            {wrestlerHud.pinCount}
          </div>
          <div className="mt-2 w-52 rounded-md border border-slate-500/70 bg-[#0b0f19]/88 px-3 py-2 text-center shadow-xl">
            <div className="font-broadcast text-[10px] font-bold tracking-[0.18em] text-slate-300 uppercase">Tap P / Escape at the mark</div>
            <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-slate-700">
              <div className="absolute left-[42%] top-0 h-full w-[16%] rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.85)]" />
              <div className="pin-escape-marker absolute top-[-3px] h-4 w-1 rounded-full bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.9)]" />
            </div>
          </div>
        </div>
      )}

      {/* ENTRANCE LOWER-THIRD NAMEPLATE + SKIP BUTTON */}
      {isEntrance && wrestlerHud.entranceName && (
        <div className="flex items-end justify-between gap-4 pb-2 sm:pb-4">
          <div className="border-l-4 border-amber-400 bg-[#0b0f19]/92 px-4 py-2.5 shadow-2xl">
            <p className="font-broadcast text-2xl sm:text-3xl font-black tracking-wider text-white uppercase leading-none">
              {wrestlerHud.entranceName}
            </p>
            {wrestlerHud.entranceSubtitle && (
              <p className="mt-1 text-xs font-semibold tracking-widest text-amber-300 uppercase">
                {wrestlerHud.entranceSubtitle}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onSkipEntrance}
            className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-lg border border-slate-500/80 bg-[#0b0f19]/92 px-4 text-xs sm:text-sm font-bold tracking-wider text-slate-100 uppercase shadow-xl transition-transform active:scale-95 hover:border-amber-400 hover:text-amber-300 whitespace-nowrap shrink-0"
          >
            <FastForward className="h-4 w-4" />
            <span>Skip Entrance</span>
          </button>
        </div>
      )}

      {/* MATCH WINNER & REMATCH OVERLAY */}
      {isFinished && (
        <div className="pointer-events-none flex flex-1 items-end justify-center pb-4 sm:pb-8">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-amber-400/55 bg-[#0b0f19]/86 px-3 py-2 text-center shadow-xl">
            <span className="font-broadcast text-xs font-bold tracking-[0.18em] text-amber-300 uppercase">Match complete · {wrestlerHud.winnerName}</span>
            <button
              type="button"
              onClick={onRematch}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-amber-400 px-3 font-broadcast text-xs font-black tracking-wider text-slate-950 uppercase transition-transform active:scale-95 hover:bg-amber-300 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Rematch</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
