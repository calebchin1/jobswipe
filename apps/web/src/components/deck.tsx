'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SwipeCard, type SwipeDirection } from './swipe-card';

/** Deep tones so white type keeps contrast; chosen per card from its id. */
const tones = ['#295c46', '#33566b', '#5e4a3a', '#45507a', '#6e4552', '#2e6463'];
function toneFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return tones[Math.abs(hash) % tones.length];
}

export type DeckCardContent = {
  id: string;
  /** Large watermark glyph; candidates are anonymous, so never a photo. */
  monogram: string;
  name: string;
  headline: string;
  meta: string;
  chips: string[];
  badge?: string;
  details?: ReactNode;
};

/** Full-bleed card: colour field, watermark, name block over a bottom fade, ⓘ details sheet. */
export function DeckCard({ card, peek = false }: { card: DeckCardContent; peek?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="deck-card" style={{ background: toneFor(card.id) }}>
      <span className="deck-monogram" aria-hidden="true">
        {card.monogram}
      </span>
      {card.badge && <span className="deck-badge">{card.badge}</span>}
      <div className="deck-bottom">
        <div className="deck-text">
          {peek ? (
            <p className="deck-name">{card.name}</p>
          ) : (
            <h3 className="deck-name">{card.name}</h3>
          )}
          <p className="deck-headline">{card.headline}</p>
          <p className="deck-meta">{card.meta}</p>
          <div className="deck-chips">
            {card.chips.slice(0, 5).map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        </div>
        {card.details && !peek && (
          <button
            className="deck-info"
            aria-expanded={open}
            aria-label="See profile details"
            onClick={() => setOpen(true)}
          >
            i
          </button>
        )}
      </div>
      {open && card.details && (
        <div className="deck-sheet">
          <button
            className="deck-sheet-close"
            aria-label="Hide profile details"
            onClick={() => setOpen(false)}
          >
            ↓
          </button>
          {card.details}
        </div>
      )}
    </article>
  );
}

/** Top card swipes; the next one peeks behind it. */
export function DeckStack({
  cards,
  onSwipe,
  disabled,
  leftLabel = 'Pass',
  rightLabel = 'Interested',
}: {
  cards: DeckCardContent[];
  onSwipe: (card: DeckCardContent, direction: SwipeDirection) => void;
  disabled?: boolean;
  leftLabel?: string;
  rightLabel?: string;
}) {
  const [top, next] = cards;
  if (!top) return null;
  return (
    <div className="deck-stack">
      {next && (
        <div className="deck-peek" aria-hidden="true">
          <DeckCard card={next} peek />
        </div>
      )}
      <SwipeCard
        key={top.id}
        label={top.name}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        disabled={disabled}
        onSwipe={(direction) => onSwipe(top, direction)}
      >
        <DeckCard card={top} />
      </SwipeCard>
    </div>
  );
}

export type RoundAction = {
  label: string;
  glyph: string;
  tone: 'undo' | 'pass' | 'save' | 'like';
  onClick: () => void;
  disabled?: boolean;
  big?: boolean;
  /** Optional visible caption under the button. */
  caption?: string;
};
export function RoundButtons({ actions }: { actions: RoundAction[] }) {
  return (
    <div className="round-actions">
      {actions.map((action) => (
        <div className="round-slot" key={action.tone}>
          <button
            className={`round-button ${action.tone} ${action.big ? 'big' : ''}`}
            aria-label={action.label}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            <span aria-hidden="true">{action.glyph}</span>
          </button>
          {action.caption && <span className="round-caption">{action.caption}</span>}
        </div>
      ))}
    </div>
  );
}

/** Full-screen match moment. Focus moves to the primary action; Escape keeps swiping. */
export function MatchOverlay({
  open,
  body,
  primary,
  onClose,
}: {
  open: boolean;
  body: string;
  primary: { label: string; onClick: () => void };
  onClose: () => void;
}) {
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    action.current?.focus();
    const key = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="match-overlay" role="dialog" aria-modal="true" aria-labelledby="match-title">
      <h2 id="match-title">It’s a match!</h2>
      <p>{body}</p>
      <button ref={action} className="match-primary" onClick={primary.onClick}>
        {primary.label}
      </button>
      <button className="match-secondary" onClick={onClose}>
        Keep swiping
      </button>
    </div>
  );
}
