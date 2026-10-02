import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { DeckButtons, DeckStack, type DeckCardContent } from '../../src/Deck';
import { Empty, Screen, s } from '../../src/ui';

export default function Discover() {
  const demo = useDemo();
  const available = jobs.filter(
    (j) => !demo.dismissed.includes(j.id) && !demo.applications.some((a) => a.jobId === j.id),
  );
  const job = available[0];
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
        Meet your next possibility →
      </Link>
    ),
  }));
  return (
    <Screen>
      <Text style={s.body}>{available.length} demo jobs · Waterloo, ON · part-time</Text>
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
                glyph: '↶',
                color: '#B8901C',
                disabled: !demo.canUndo,
                onPress: demo.undo,
              },
              {
                label: 'Pass',
                glyph: '✕',
                color: '#D2584A',
                big: true,
                onPress: () => demo.pass(job.id),
              },
              {
                label: demo.saved.includes(job.id) ? 'Unsave' : 'Save',
                glyph: demo.saved.includes(job.id) ? '★' : '☆',
                color: '#3E7CB1',
                onPress: () => demo.save(job.id),
              },
              {
                label: 'Apply',
                glyph: '✓',
                color: '#2E8B57',
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
                  glyph: '↶',
                  color: '#B8901C',
                  disabled: !demo.canUndo,
                  onPress: demo.undo,
                },
              ]}
            />
          </View>
        </>
      )}
      <Text style={s.footer}>
        *Commute times are illustrative. Swipe right to apply, left to pass. Your name and contact
        details stay hidden until an interview and an authorized reveal.
      </Text>
    </Screen>
  );
}
