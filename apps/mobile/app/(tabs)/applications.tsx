import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { Empty, Heading, Screen, s, Tag } from '../../src/ui';
export default function Applications() {
  const { applications } = useDemo();
  return (
    <Screen>
      <Heading
        eyebrow="ONE STEP AT A TIME"
        title="Your next chapter."
        subtitle="See where each conversation stands."
      />
      {applications.length === 0 && (
        <Empty
          title="Your story starts here."
          description="Apply to a sample job in Discover to see your application timeline."
        />
      )}
      {applications.map((application) => {
        const job = jobs.find((j) => j.id === application.jobId);
        if (!job) return null;
        return (
          <View key={job.id} style={s.panel}>
            <View style={s.row}>
              <Tag>{application.stage}</Tag>
              <Tag>Identity hidden</Tag>
            </View>
            <Text style={s.cardTitle}>{job.category}</Text>
            <Text style={s.body}>{job.company}</Text>
            <Link href={{ pathname: '/applications/[id]', params: { id: job.id } }} style={s.link}>
              View timeline →
            </Link>
          </View>
        );
      })}
    </Screen>
  );
}
