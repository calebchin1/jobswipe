import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { Button, Empty, Heading, Screen, s, Tag } from '../../src/ui';
export default function Discover() {
  const demo = useDemo();
  const available = jobs.filter(
    (j) => !demo.dismissed.includes(j.id) && !demo.applications.some((a) => a.jobId === j.id),
  );
  const job = available[0];
  return (
    <Screen>
      <Heading
        eyebrow="YOUR POTENTIAL COMES FIRST"
        title={'A fresh start.\nOn your terms.'}
        subtitle="Part-time possibilities around Waterloo."
      />
      <View style={s.row}>
        <Tag>Waterloo, ON</Tag>
        <Tag>Part-time</Tag>
        <Text style={s.body}>{available.length} demo jobs</Text>
      </View>
      {job ? (
        <>
          <View style={[s.panel, { padding: 0, overflow: 'hidden' }]}>
            <View style={{ backgroundColor: job.color, padding: 25, gap: 24 }}>
              <View style={s.row}>
                <Text style={{ fontSize: 42, fontWeight: '800', color: '#243F37' }}>
                  {job.monogram}
                </Text>
                <Text style={[s.label, { flex: 1 }]}>{job.company}</Text>
                <Tag>Sample posting</Tag>
              </View>
              <Text style={[s.title, { fontSize: 33, lineHeight: 38 }]}>{job.title}</Text>
              <Text style={s.label}>{job.category}</Text>
            </View>
            <View style={{ padding: 22, gap: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text style={s.cardTitle}>{job.pay}</Text>
                <Text style={s.body}>{job.commute} min*</Text>
              </View>
              <Text style={s.body}>{job.hours} · In person</Text>
              <View style={s.row}>
                {job.skills.map((skill) => (
                  <Tag key={skill}>{skill}</Tag>
                ))}
              </View>
              <Link
                href={{ pathname: '/jobs/[jobId]', params: { jobId: job.id } }}
                accessibilityLabel={`Read ${job.category} job details`}
                style={s.link}
              >
                Meet your next possibility →
              </Link>
            </View>
          </View>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Button label="Pass" secondary onPress={() => demo.pass(job.id)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={demo.saved.includes(job.id) ? 'Unsave' : 'Save'}
                secondary
                onPress={() => demo.save(job.id)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Apply →" onPress={() => demo.apply(job.id)} />
            </View>
          </View>
        </>
      ) : (
        <Empty
          title="You’re all caught up."
          description="You’ve explored every sample job. Check your saved jobs or reset the demo from Profile."
        />
      )}
      <Button label="Undo last pass" secondary disabled={!demo.canUndo} onPress={demo.undo} />
      <View style={s.panel}>
        <Text style={s.label}>◌ Start with what you bring.</Text>
        <Text style={s.body}>
          Your name and contact details stay hidden on the platform before an interview and an
          authorized reveal.
        </Text>
      </View>
      <Text style={s.footer}>
        *Commute times are illustrative. These buttons are the accessible alternative to future
        swipe gestures.
      </Text>
    </Screen>
  );
}
