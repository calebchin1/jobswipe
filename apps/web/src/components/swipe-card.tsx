'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export type SwipeDirection = 'left' | 'right';

/**
 * Horizontal swipe for one deck card (touch, pen or mouse). Vertical scrolling stays native via
 * touch-action: pan-y. Drags starting on controls are ignored so buttons still work, and the
 * buttons beside the card remain the accessible path; arrow keys work while the card is focused.
 */
export function SwipeCard({
  children,
  onSwipe,
  disabled = false,
  leftLabel = 'Pass',
  rightLabel = 'Interested',
  className = '',
  label,
}: {
  children: ReactNode;
  onSwipe: (direction: SwipeDirection) => void;
  disabled?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
  label: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<SwipeDirection | null>(null);
  const start = useRef<{ x: number; y: number; id: number; horizontal: boolean | null } | null>(
    null,
  );
  const width = useRef(320);
  // Pointer events can outrun React renders; read the live offset, not render state.
  const live = useRef(0);
  function setOffset(value: number) {
    live.current = value;
    setDx(value);
  }

  function commit(direction: SwipeDirection) {
    if (disabled || leaving) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setOffset(0);
      onSwipe(direction);
      return;
    }
    setLeaving(direction);
    window.setTimeout(() => {
      setLeaving(null);
      setOffset(0);
      onSwipe(direction);
    }, 180);
  }
  function down(event: PointerEvent<HTMLDivElement>) {
    if (disabled || leaving || (event.pointerType === 'mouse' && event.button !== 0)) return;
    if ((event.target as HTMLElement).closest('button,a,input,select,textarea,summary,label'))
      return;
    width.current = event.currentTarget.getBoundingClientRect().width || 320;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId, horizontal: null };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current;
    if (!origin || origin.id !== event.pointerId) return;
    const x = event.clientX - origin.x;
    const y = event.clientY - origin.y;
    if (origin.horizontal === null) {
      if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
      origin.horizontal = Math.abs(x) > Math.abs(y);
      if (!origin.horizontal) {
        start.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    setOffset(x);
  }
  function up(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current;
    start.current = null;
    setDragging(false);
    if (!origin?.horizontal || origin.id !== event.pointerId) return;
    const threshold = Math.min(110, width.current * 0.28);
    if (live.current > threshold) commit('right');
    else if (live.current < -threshold) commit('left');
    else setOffset(0);
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      commit('right');
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      commit('left');
    }
  }

  const offset = leaving ? (leaving === 'right' ? 1 : -1) * (width.current + 160) : dx;
  const strength = Math.min(1, Math.abs(dx) / 110);
  return (
    <div
      className={`swipe-card ${dragging ? 'dragging' : ''} ${className}`}
      style={{ transform: `translateX(${offset}px) rotate(${offset / 28}deg)` }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
        setOffset(0);
      }}
      onKeyDown={key}
      tabIndex={0}
      role="group"
      aria-roledescription="swipe card"
      aria-label={`${label}. Swipe or press right arrow for ${rightLabel.toLowerCase()}, left arrow to ${leftLabel.toLowerCase()}.`}
    >
      <span
        className="swipe-stamp right"
        aria-hidden="true"
        style={{ opacity: dx > 0 ? strength : 0 }}
      >
        {rightLabel}
      </span>
      <span
        className="swipe-stamp left"
        aria-hidden="true"
        style={{ opacity: dx < 0 ? strength : 0 }}
      >
        {leftLabel}
      </span>
      {children}
    </div>
  );
}
