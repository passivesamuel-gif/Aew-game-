import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  Flame,
  Hand,
  RefreshCw,
  Shield,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import type { WrestlerHudSnapshot } from '../arena/wrestlerController';

interface MobileControllerProps {
  wrestlerHud: WrestlerHudSnapshot;
  onJoystickMove: (x: number, z: number, sprint: boolean) => void;
  onRunChange: (held: boolean) => void;
  onAttack: () => void;
  onGrapple: () => void;
  onWhip: () => void;
  onPin: () => void;
  onReverse: () => void;
  onClimb: () => void;
  onDive: () => void;
  onFinisher: () => void;
  onUserGesture?: () => void;
}

interface ActionCircleProps {
  label: string;
  onTrigger: () => void;
  onUserGesture?: () => void;
  className: string;
  sizeClass: string;
  posClass: string;
  icon: ReactNode;
  highlighted?: boolean;
  holdable?: boolean;
  onHoldChange?: (held: boolean) => void;
  heldActive?: boolean;
  ariaLabel: string;
}

function ActionCircle({
  label,
  onTrigger,
  onUserGesture,
  className,
  sizeClass,
  posClass,
  icon,
  highlighted = false,
  holdable = false,
  onHoldChange,
  heldActive = false,
  ariaLabel,
}: ActionCircleProps) {
  const [pressed, setPressed] = useState(false);
  const pointerIdRef = useRef<number | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    onUserGesture?.();
    if (holdable) {
      onHoldChange?.(true);
    } else {
      onTrigger();
    }
  };

  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setPressed(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (holdable) {
      onHoldChange?.(false);
    }
  };

  const isDown = pressed || heldActive;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      className={`pointer-events-auto absolute ${posClass} ${sizeClass} flex flex-col items-center justify-center rounded-full border-2 font-broadcast uppercase tracking-wider text-white shadow-xl touch-none select-none transition-transform duration-75 ${className} ${
        isDown ? 'scale-90 brightness-110' : 'scale-100'
      } ${highlighted ? 'ring-2 ring-amber-300 border-amber-200' : ''}`}
    >
      <span className="pointer-events-none leading-none">{icon}</span>
      <span className="pointer-events-none mt-0.5 text-[9.5px] sm:text-[10px] font-bold leading-none whitespace-nowrap drop-shadow">
        {label}
      </span>
    </button>
  );
}

const JOYSTICK_MAX_R = 44;

export function MobileController({
  wrestlerHud,
  onJoystickMove,
  onRunChange,
  onAttack,
  onGrapple,
  onWhip,
  onPin,
  onReverse,
  onClimb,
  onDive,
  onFinisher,
  onUserGesture,
}: MobileControllerProps) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false, sprint: false });
  const [runHeld, setRunHeld] = useState(false);

  const updateStickFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = baseRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_MAX_R) {
        dx = (dx / dist) * JOYSTICK_MAX_R;
        dy = (dy / dist) * JOYSTICK_MAX_R;
      }

      const normX = dx / JOYSTICK_MAX_R;
      const normZ = -dy / JOYSTICK_MAX_R;
      const mag = Math.hypot(normX, normZ);
      const isSprint = mag > 0.86;

      setKnob({ x: dx, y: dy, active: true, sprint: isSprint });
      onJoystickMove(normX, normZ, isSprint);
    },
    [onJoystickMove],
  );

  const handleStickDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    onUserGesture?.();
    updateStickFromEvent(e.clientX, e.clientY);
  };

  const handleStickMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateStickFromEvent(e.clientX, e.clientY);
  };

  const handleStickUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setKnob({ x: 0, y: 0, active: false, sprint: false });
    onJoystickMove(0, 0, false);
  };

  if (wrestlerHud.matchPhase !== 'active') {
    return null;
  }

  const { actions } = wrestlerHud;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex items-end justify-between px-4 pb-4 sm:px-7 sm:pb-6 touch-none select-none">
      {/* BOTTOM-LEFT: FIFA Mobile-style 360-degree Virtual Analog Joystick */}
      <div
        ref={baseRef}
        role="application"
        aria-label="Movement Analog Joystick"
        onPointerDown={handleStickDown}
        onPointerMove={handleStickMove}
        onPointerUp={handleStickUp}
        onPointerCancel={handleStickUp}
        onLostPointerCapture={handleStickUp}
        className={`pointer-events-auto relative flex h-[136px] w-[136px] sm:h-[148px] sm:w-[148px] items-center justify-center rounded-full border-2 touch-none select-none transition-colors ${
          knob.sprint
            ? 'border-amber-400/80 bg-[#0b0f19]/60 shadow-[0_0_24px_rgba(245,158,11,0.28)]'
            : knob.active
              ? 'border-sky-400/75 bg-[#0b0f19]/55 shadow-[0_0_18px_rgba(56,189,248,0.2)]'
              : 'border-slate-300/30 bg-[#0b0f19]/42'
        }`}
      >
        {/* Subtle inner directional guide ring */}
        <div className="pointer-events-none absolute inset-4 rounded-full border border-slate-400/20" />
        <div className="pointer-events-none absolute h-2 w-2 rounded-full bg-slate-300/35" />

        {/* Thumb Knob */}
        <div
          style={{
            transform: `translate3d(${knob.x}px, ${knob.y}px, 0)`,
          }}
          className={`pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border-2 shadow-xl transition-colors ${
            knob.sprint
              ? 'border-amber-200 bg-amber-500/85'
              : knob.active
                ? 'border-sky-200 bg-sky-500/85'
                : 'border-slate-200/65 bg-slate-800/85'
          }`}
        >
          <div className="h-5 w-5 rounded-full bg-white/30" />
        </div>
      </div>

      {/* BOTTOM-RIGHT: Contextual FIFA Mobile-style Circular Action Cluster */}
      <div className="pointer-events-none relative h-[220px] w-[224px] sm:h-[232px] sm:w-[236px]">
        {actions.finisher.visible && (
          <ActionCircle
            label={actions.finisher.label}
            ariaLabel="Execute Finisher"
            onTrigger={onFinisher}
            onUserGesture={onUserGesture}
            highlighted
            posClass="right-[154px] bottom-[48px]"
            sizeClass="h-[66px] w-[66px]"
            className="border-yellow-100 bg-gradient-to-b from-yellow-400 via-amber-500 to-red-600 text-slate-950 shadow-[0_0_24px_rgba(250,204,21,0.6)]"
            icon={<Flame className="h-6 w-6 text-slate-950" />}
          />
        )}

        {actions.pin.visible && (
          <ActionCircle
            label={actions.pin.label}
            ariaLabel="Pin Opponent"
            onTrigger={onPin}
            onUserGesture={onUserGesture}
            highlighted
            posClass="right-[150px] bottom-[136px]"
            sizeClass="h-[64px] w-[64px]"
            className="border-emerald-200 bg-gradient-to-b from-emerald-400 to-emerald-700 shadow-[0_0_22px_rgba(16,185,129,0.55)]"
            icon={<Trophy className="h-5 w-5" />}
          />
        )}

        {actions.dive.visible && (
          <ActionCircle
            label={actions.dive.label}
            ariaLabel="Diving Attack"
            onTrigger={onDive}
            onUserGesture={onUserGesture}
            highlighted
            posClass="right-[76px] bottom-[140px]"
            sizeClass="h-[64px] w-[64px]"
            className="border-cyan-200 bg-gradient-to-b from-cyan-400 to-teal-600 shadow-[0_0_22px_rgba(6,182,212,0.55)]"
            icon={<ArrowUpRight className="h-6 w-6" />}
          />
        )}

        {actions.climb.visible && (
          <ActionCircle
            label={actions.climb.label}
            ariaLabel="Climb Turnbuckle"
            onTrigger={onClimb}
            onUserGesture={onUserGesture}
            posClass="right-[10px] bottom-[160px]"
            sizeClass="h-[56px] w-[56px]"
            className="border-orange-200/80 bg-gradient-to-b from-orange-400 to-orange-700"
            icon={<ArrowUpRight className="h-5 w-5" />}
          />
        )}

        {actions.grapple.visible && (
          <ActionCircle
            label={actions.grapple.label}
            ariaLabel={actions.grapple.label}
            onTrigger={onGrapple}
            onUserGesture={onUserGesture}
            posClass="right-[76px] bottom-[140px]"
            sizeClass="h-[58px] w-[58px]"
            className="border-amber-200/80 bg-gradient-to-b from-amber-400 to-orange-600"
            icon={<Hand className="h-5 w-5" />}
          />
        )}

        {actions.whip.visible && (
          <ActionCircle
            label={actions.whip.label}
            ariaLabel={actions.whip.label}
            onTrigger={onWhip}
            onUserGesture={onUserGesture}
            posClass="right-[8px] bottom-[94px]"
            sizeClass="h-[56px] w-[56px]"
            className="border-sky-200/80 bg-gradient-to-b from-sky-400 to-blue-700"
            icon={<RefreshCw className="h-5 w-5" />}
          />
        )}

        {actions.reverse.visible && (
          <ActionCircle
            label={actions.reverse.label}
            ariaLabel="Reverse or Counter"
            onTrigger={onReverse}
            onUserGesture={onUserGesture}
            highlighted={actions.reverse.highlighted}
            posClass="right-[96px] bottom-[72px]"
            sizeClass="h-[56px] w-[56px]"
            className="border-violet-200/80 bg-gradient-to-b from-violet-500 to-purple-800"
            icon={<Shield className="h-5 w-5" />}
          />
        )}

        {actions.run.visible && (
          <ActionCircle
            label={actions.run.label}
            ariaLabel="Hold to Sprint"
            onTrigger={() => undefined}
            onUserGesture={onUserGesture}
            holdable
            heldActive={runHeld}
            onHoldChange={(held) => {
              setRunHeld(held);
              onRunChange(held);
            }}
            posClass="right-[92px] bottom-[8px]"
            sizeClass="h-[52px] w-[52px]"
            className={
              runHeld
                ? 'border-emerald-200 bg-gradient-to-b from-emerald-500 to-teal-700'
                : 'border-slate-300/60 bg-gradient-to-b from-slate-600 to-slate-800'
            }
            icon={<Zap className="h-4 w-4" />}
          />
        )}

        {actions.attack.visible && (
          <ActionCircle
            label={actions.attack.label}
            ariaLabel={actions.attack.label}
            onTrigger={onAttack}
            onUserGesture={onUserGesture}
            posClass="right-[4px] bottom-[4px]"
            sizeClass="h-[76px] w-[76px]"
            className="border-rose-200/85 bg-gradient-to-b from-rose-500 to-red-700 shadow-[0_0_24px_rgba(244,63,94,0.45)]"
            icon={<Swords className="h-7 w-7" />}
          />
        )}
      </div>

      {/* Subtle desktop hint on wide screens only when no touch */}
      <div className="pointer-events-none hidden lg:flex fixed bottom-3 left-1/2 -translate-x-1/2 items-center gap-3 text-[11px] font-medium text-slate-300/70 whitespace-nowrap">
        <span>WASD Move</span>
        <span>Shift Run</span>
        <span>J Attack</span>
        <span>K Grapple</span>
        <span>L Whip/Cross</span>
        <span>O Reverse</span>
        <span>U Climb</span>
        <span>I Dive</span>
        <span>P Pin</span>
        <span>F Finisher</span>
      </div>
    </div>
  );
}
