'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SwipeCard, type SwipeDirection } from './swipe-card';

/** A consistent accent for each candidate card. */
const tones = ['#295c46', '#33566b', '#5e4a3a', '#45507a', '#6e4552', '#2e6463'];
function toneFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return tones[Math.abs(hash) % tones.length];
}

export type DeckCardContent = {
  id: string;
  monogram: string;
  name: string;
  headline: string;
  school: string;
  degree: string;
  availability: string;
  skills: string[];
  badge?: string;
  evidence?: string[];
  details?: ReactNode;
};

function ProfileFacts({ card }: { card: DeckCardContent }) {
  return (
    <>
      <dl className="deck-facts">
        <div>
          <dt>School + degree</dt>
          <dd>{card.school}</dd>
          <dd className="deck-degree">{card.degree}</dd>
        </div>
        <div>
          <dt>Hours / week</dt>
          <dd>{card.availability}</dd>
        </div>
      </dl>
      <section className="deck-skills" aria-label="Skills">
        <h4>Skills</h4>
        <div className="deck-chips">
          {card.skills.slice(0, 3).map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
      </section>
      <section className="deck-evidence" aria-label="Past experience">
        <h4>Past experience</h4>
        {card.evidence?.length ? (
          <ul>
            {card.evidence.slice(0, 3).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>No past experience added yet.</p>
        )}
      </section>
    </>
  );
}

/** Opening a profile adds a history entry so the browser's back gesture returns to the deck. */
export function DeckCard({
  card,
  peek = false,
  onOpenChange,
}: {
  card: DeckCardContent;
  peek?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const sheet = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const touchGesture = useRef<{ x: number; y: number } | null>(null);
  const hash = `#profile-${card.id}`;

  useEffect(() => {
    if (peek) return;
    const sync = () => {
      const expanded = window.location.hash === hash;
      setOpen(expanded);
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      if (window.location.hash === hash) {
        const { candidateProfile: _, ...state } = window.history.state ?? {};
        window.history.replaceState(state, '', window.location.pathname + window.location.search);
      }
    };
  }, [hash, peek]);

  useEffect(() => {
    onOpenChange?.(open);
    if (open) sheet.current?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, onOpenChange]);

  function showProfile() {
    window.history.pushState({ ...window.history.state, candidateProfile: card.id }, '', hash);
    setOpen(true);
  }
  function closeProfile() {
    if (window.history.state?.candidateProfile === card.id) window.history.back();
    else {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      );
      setOpen(false);
    }
  }

  return (
    <article
      className="deck-card"
      style={{ '--card-accent': toneFor(card.id) } as React.CSSProperties}
    >
      <div className="deck-bottom" inert={open}>
        <div className="deck-text">
          <div className="deck-heading-row">
            {peek ? (
              <p className="deck-name">{card.name}</p>
            ) : (
              <h3 className="deck-name">{card.name}</h3>
            )}
            {card.badge && <span className="deck-badge">{card.badge}</span>}
          </div>
          <p className="deck-headline">{card.headline}</p>
          <ProfileFacts card={card} />
        </div>
        {!peek && (
          <button
            ref={trigger}
            className="deck-info"
            aria-expanded={open}
            aria-label="See profile details"
            onClick={showProfile}
          >
            View profile <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      {open && !peek && (
        <div
          className="deck-sheet"
          role="region"
          aria-label={`${card.name} profile`}
          onKeyDown={(event) => {
            if (
              event.key === 'Escape' ||
              (event.key === 'ArrowLeft' &&
                !(event.target as HTMLElement).closest('button,a,input,textarea'))
            ) {
              event.preventDefault();
              event.stopPropagation();
              closeProfile();
            }
          }}
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') return;
            if ((event.target as HTMLElement).closest('button,a')) return;
            gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          }}
          onPointerMove={(event) => {
            const start = gesture.current;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) gesture.current = null;
            else if (dx > 12 && Math.abs(dx) > Math.abs(dy) * 1.5)
              event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const start = gesture.current;
            gesture.current = null;
            if (
              start &&
              start.id === event.pointerId &&
              event.clientX - start.x > 85 &&
              Math.abs(event.clientY - start.y) < 60
            )
              closeProfile();
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
          onTouchStart={(event) => {
            if ((event.target as HTMLElement).closest('button,a') || event.touches.length !== 1)
              return;
            touchGesture.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
          }}
          onTouchMove={(event) => {
            const start = touchGesture.current;
            if (!start || event.touches.length !== 1) {
              touchGesture.current = null;
              return;
            }
            const dx = event.touches[0].clientX - start.x;
            const dy = event.touches[0].clientY - start.y;
            if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) touchGesture.current = null;
          }}
          onTouchEnd={(event) => {
            const start = touchGesture.current;
            touchGesture.current = null;
            const end = event.changedTouches[0];
            if (start && end && end.clientX - start.x > 85 && Math.abs(end.clientY - start.y) < 60)
              closeProfile();
          }}
          onTouchCancel={() => {
            touchGesture.current = null;
          }}
        >
          <div
            className="deck-sheet-scroll"
            ref={sheet}
            tabIndex={0}
            aria-label="Profile information"
          >
            <p className="deck-name">{card.name}</p>
            <h3 className="deck-headline">{card.headline}</h3>
            <ProfileFacts card={card} />
            {card.details && <div className="deck-extra">{card.details}</div>}
          </div>
          <div className="deck-sheet-footer">
            <button
              className="deck-sheet-close"
              aria-label="Hide profile details"
              onClick={closeProfile}
            >
              <span aria-hidden="true">←</span> Back to candidates
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function ActiveCard({
  card,
  onSwipe,
  disabled,
  leftLabel,
  rightLabel,
}: {
  card: DeckCardContent;
  onSwipe: (card: DeckCardContent, direction: SwipeDirection) => void;
  disabled?: boolean;
  leftLabel: string;
  rightLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <SwipeCard
      label={card.name}
      leftLabel={leftLabel}
      rightLabel={rightLabel}
      disabled={disabled || expanded}
      onSwipe={(direction) => onSwipe(card, direction)}
    >
      <DeckCard card={card} onOpenChange={setExpanded} />
    </SwipeCard>
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
      <ActiveCard
        key={top.id}
        card={top}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        disabled={disabled}
        onSwipe={onSwipe}
      />
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
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="match-overlay"
      aria-labelledby="match-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="match-title">It’s a match!</h2>
      <p>{body}</p>
      <button autoFocus className="match-primary" onClick={primary.onClick}>
        {primary.label}
      </button>
      <button className="match-secondary" onClick={onClose}>
        Keep swiping
      </button>
    </dialog>
  );
}
