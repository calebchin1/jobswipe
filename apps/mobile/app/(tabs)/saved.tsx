import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { Button, Empty, Heading, Screen, s } from '../../src/ui';
export default function Saved() {
  const demo = useDemo();
  const saved = jobs.filter((j) => demo.saved.includes(j.id));
  return (
    <Screen>
      <Heading
        eyebrow="GOOD THINGS CAN WAIT"
        title="Your shortlist."
        subtitle="Saving a job keeps it here. It doesn’t send an application."
      />
      {saved.length === 0 && (
        <Empty
          title="Room for possibilities."
          description="Tap Save on a job you’d like to come back to."
        />
      )}
      {saved.map((job) => (
        <View key={job.id} style={s.panel}>
          <Text style={s.cardTitle}>{job.category}</Text>
          <Text style={s.body}>{job.company}</Text>
          <Text style={s.label}>
            {job.pay} · {job.hours}
          </Text>
          <Link href={{ pathname: '/jobs/[jobId]', params: { jobId: job.id } }} style={s.link}>
            View job →
          </Link>
          <Button secondary label="Remove from saved" onPress={() => demo.save(job.id)} />
        </View>
      ))}
    </Screen>
  );
}
