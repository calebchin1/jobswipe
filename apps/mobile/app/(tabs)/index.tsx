import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { DeckButtons, DeckStack, type DeckCardContent } from '../../src/Deck';
import { colors, Empty, Screen, s } from '../../src/ui';

export default function Discover() {
  const demo = useDemo();
  const available = jobs.filter(
    (j) => !demo.dismissed.includes(j.id) && !demo.applications.some((a) => a.jobId === j.id),
  );
  const job = available[0];
  const reviewed = jobs.length - available.length;
  const cards: DeckCardContent[] = available.slice(0, 2).map((item) => ({
    id: item.id,
    monogram: item.monogram,
    title: item.category,
    subtitle: item.company,
    highlight: item.pay,
    chips: [item.hours, `${item.commute} min*`, ...item.skills],
    extra: (
      <Link
        href={{ pathname: '/jobs/[jobId]', params: { jobId: item.id } }}
        accessibilityLabel={`Read ${item.category} job details`}
        style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14, paddingVertical: 8 }}
      >
        View job details →
      </Link>
    ),
  }));
  return (
    <Screen compact>
      <View style={{ gap: 10 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text accessibilityRole="header" style={s.label}>
            Discover · Waterloo, ON
          </Text>
          <Text style={s.progressLabel}>
            {reviewed} of {jobs.length} reviewed
          </Text>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityLabel="Demo jobs reviewed"
          accessibilityValue={{ min: 0, max: jobs.length, now: reviewed }}
          style={s.progressTrack}
        >
          <View style={[s.progressFill, { width: `${(reviewed / jobs.length) * 100}%` }]} />
        </View>
        <Text style={s.context}>
          {available.length} fictional jobs remaining · No real applications are sent
        </Text>
      </View>
      {job ? (
        <>
          <DeckStack
            cards={cards}
            rightLabel="Apply"
            onSwipe={(card, direction) =>
              direction === 'right' ? demo.apply(card.id) : demo.pass(card.id)
            }
          />
          <DeckButtons
            actions={[
              {
                label: 'Undo last pass',
                caption: 'Undo',
                glyph: '↶',
                color: colors.gold,
                disabled: !demo.canUndo,
                onPress: demo.undo,
              },
              {
                label: 'Pass',
                glyph: '✕',
                color: colors.red,
                big: true,
                onPress: () => demo.pass(job.id),
              },
              {
                label: demo.saved.includes(job.id) ? 'Unsave' : 'Save',
                glyph: demo.saved.includes(job.id) ? '★' : '☆',
                color: colors.blue,
                onPress: () => demo.save(job.id),
              },
              {
                label: 'Apply',
                glyph: '✓',
                color: colors.green,
                big: true,
                onPress: () => demo.apply(job.id),
              },
            ]}
          />
        </>
      ) : (
        <>
          <Empty
            title="You’re all caught up."
            description="You’ve explored every sample job. Check your saved jobs or reset the demo from Profile."
          />
          <View style={{ alignItems: 'center' }}>
            <DeckButtons
              actions={[
                {
                  label: 'Undo last pass',
                  caption: 'Undo',
                  glyph: '↶',
                  color: colors.gold,
                  disabled: !demo.canUndo,
                  onPress: demo.undo,
                },
              ]}
            />
          </View>
        </>
      )}
      <Text style={s.footer}>
        Swipe right to apply, left to pass. *Commutes are illustrative. Identity stays protected.
      </Text>
    </Screen>
  );
}
