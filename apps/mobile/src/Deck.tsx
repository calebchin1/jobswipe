import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SwipeCard, type SwipeDirection } from './SwipeCard';

/** Deep tones so white type passes contrast; picked per card from its id. */
const tones = ['#295C46', '#33566B', '#5E4A3A', '#45507A', '#6E4552', '#2E6463'];
export function toneFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return tones[Math.abs(hash) % tones.length]!;
}

export type DeckCardContent = {
  id: string;
  monogram: string;
  title: string;
  subtitle: string;
  highlight: string;
  chips: string[];
  details?: React.ReactNode;
  note?: string;
  /** Always-visible element under the chips, e.g. a details link. */
  extra?: React.ReactNode;
};

/** Many thin bands approximate a bottom gradient without a native gradient module. */
const fadeSteps = Array.from(
  { length: 14 },
  (_, i) => Math.round(0.42 * ((i + 1) / 14) ** 1.6 * 100) / 100,
);

export function useCardHeight() {
  const { height } = useWindowDimensions();
  // Leave room for the header, action buttons and tab bar so the whole deck fits on screen.
  return Math.round(Math.min(600, Math.max(340, height - 300)));
}

/** Tinder-style full-bleed card: colour field, big monogram, title block over a bottom fade. */
export function DeckCard({ card, height }: { card: DeckCardContent; height: number }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.card, { height, backgroundColor: toneFor(card.id) }]}>
      <Text style={styles.monogram} accessibilityElementsHidden importantForAccessibility="no">
        {card.monogram}
      </Text>
      <View style={styles.fade} pointerEvents="none">
        {fadeSteps.map((opacity, index) => (
          <View key={index} style={[styles.band, { opacity }]} />
        ))}
      </View>
      <View style={styles.bottom}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>{card.title}</Text>
          <Text style={styles.subtitle}>{card.subtitle}</Text>
          <Text style={styles.highlight}>{card.highlight}</Text>
          <View style={styles.chips}>
            {card.chips.slice(0, 4).map((chip) => (
              <View key={chip} style={styles.chip}>
                <Text style={styles.chipText}>{chip}</Text>
              </View>
            ))}
          </View>
          {!!card.note && <Text style={styles.note}>{card.note}</Text>}
          {card.extra}
        </View>
        {!!card.details && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? 'Hide details' : 'Show details'}
            onPress={() => setOpen((value) => !value)}
            style={styles.info}
          >
            <Text style={styles.infoText}>{open ? '↓' : 'i'}</Text>
          </Pressable>
        )}
      </View>
      {open && !!card.details && (
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>{card.details}</ScrollView>
        </View>
      )}
    </View>
  );
}

/** Top card swipes; the next card peeks behind it like a physical stack. */
export function DeckStack({
  cards,
  onSwipe,
  canSwipe,
  rightLabel,
  leftLabel = 'Pass',
}: {
  cards: DeckCardContent[];
  onSwipe: (card: DeckCardContent, direction: SwipeDirection) => void;
  canSwipe?: (direction: SwipeDirection) => boolean;
  rightLabel: string;
  leftLabel?: string;
}) {
  const height = useCardHeight();
  const [top, next] = cards;
  if (!top) return null;
  return (
    <View style={{ height: height + 14 }}>
      {next && (
        <View
          style={styles.peek}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
        >
          <DeckCard card={next} height={height} />
        </View>
      )}
      <SwipeCard
        key={top.id}
        label={top.title}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        canSwipe={canSwipe}
        onSwipe={(direction) => onSwipe(top, direction)}
      >
        <DeckCard card={top} height={height} />
      </SwipeCard>
    </View>
  );
}

type RoundAction = {
  label: string;
  glyph: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
  big?: boolean;
};
/** Floating round actions: small undo, big pass, small save, big like. */
export function DeckButtons({ actions }: { actions: RoundAction[] }) {
  return (
    <View style={styles.actions}>
      {actions.map((action) => {
        const size = action.big ? 68 : 52;
        return (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
            disabled={action.disabled}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.round,
              { width: size, height: size, borderRadius: size / 2 },
              action.disabled && { opacity: 0.35 },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <Text
              style={{ fontSize: action.big ? 30 : 22, color: action.color, fontWeight: '700' }}
            >
              {action.glyph}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Full-screen match moment. */
export function MatchOverlay({
  visible,
  title = 'It’s a match!',
  body,
  primary,
  onClose,
}: {
  visible: boolean;
  title?: string;
  body: string;
  primary?: { label: string; onPress: () => void };
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.match} accessibilityViewIsModal>
        <Text style={styles.matchTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.matchBody}>{body}</Text>
        {primary && (
          <Pressable
            accessibilityRole="button"
            onPress={primary.onPress}
            style={styles.matchPrimary}
          >
            <Text style={styles.matchPrimaryText}>{primary.label}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.matchSecondary}>
          <Text style={styles.matchSecondaryText}>Keep swiping</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    shadowColor: '#1B2A22',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  monogram: {
    position: 'absolute',
    top: 26,
    left: 24,
    fontSize: 96,
    fontWeight: '800',
    letterSpacing: -4,
    color: '#FFFFFF26',
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  band: { flex: 1, backgroundColor: '#000000' },
  bottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, padding: 22 },
  title: { fontSize: 30, lineHeight: 34, fontWeight: '800', letterSpacing: -0.8, color: '#FFFFFF' },
  subtitle: { fontSize: 15, color: '#FFFFFFE0', fontWeight: '600' },
  highlight: { fontSize: 17, color: '#FFFFFF', fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: {
    backgroundColor: '#FFFFFF2E',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontSize: 12, color: '#FFFFFF', fontWeight: '600' },
  note: { fontSize: 12, lineHeight: 17, color: '#FFFFFFD0', marginTop: 4 },
  info: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: { fontSize: 17, fontWeight: '800', color: '#243F37' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  peek: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 14,
    transform: [{ scale: 0.95 }],
    opacity: 0.85,
  },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18 },
  round: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B2A22',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  match: {
    flex: 1,
    backgroundColor: '#1F4A38F2',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 18,
  },
  matchTitle: {
    fontSize: 46,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: -1.5,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  matchBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFFE6',
    textAlign: 'center',
    maxWidth: 340,
  },
  matchPrimary: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 28,
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 8,
  },
  matchPrimaryText: { fontSize: 16, fontWeight: '800', color: '#1F4A38' },
  matchSecondary: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 },
  matchSecondaryText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
