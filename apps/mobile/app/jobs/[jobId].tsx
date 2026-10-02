import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { Button, Empty, Heading, Screen, s, Tag } from '../../src/ui';
export default function JobDetail() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const demo = useDemo();
  const job = jobs.find((j) => j.id === jobId);
  if (!job)
    return (
      <Screen>
        <Empty
          title="Job unavailable"
          description="This sample job could not be found. Go back to Discover."
        />
      </Screen>
    );
  const application = demo.applications.find((a) => a.jobId === job.id);
  return (
    <Screen>
      <Heading
        eyebrow={job.company}
        title={job.category}
        subtitle="Fictional posting · Waterloo, Ontario"
      />
      <View style={s.row}>
        <Tag>{job.pay}</Tag>
        <Tag>{job.hours}</Tag>
        <Tag>In person</Tag>
      </View>
      <View style={s.panel}>
        <Text style={s.cardTitle}>A little about the role</Text>
        <Text style={s.body}>{job.summary}</Text>
        <Text style={s.label}>What you’ll bring</Text>
        {job.source.mustHaves.map((skill) => (
          <Text style={s.body} key={skill}>
            • {skill}
          </Text>
        ))}
        <Text style={s.label}>Your schedule</Text>
        <Text style={s.body}>{job.schedule}</Text>
      </View>
      <View style={s.panel}>
        <Text style={s.cardTitle}>Clear from the start</Text>
        <Text style={s.body}>
          Existing vacancy: {job.source.isVacancy ? 'yes' : 'no'} (sample data).
        </Text>
        <Text style={s.body}>
          AI screening:{' '}
          {job.ai
            ? 'This fictional employer uses AI-assisted screening.'
            : 'This fictional employer does not use AI screening.'}
        </Text>
        <Text style={s.body}>Commute: {job.commute} minutes, illustrative only.</Text>
        <Text style={s.body}>
          First interview: audio, with identity hidden on the platform. An accommodation path will
          be available before launch.
        </Text>
      </View>
      <Button
        label={
          application
            ? application.stage === 'Withdrawn'
              ? 'Application withdrawn'
              : 'Applied in demo'
            : 'Apply in demo →'
        }
        disabled={!!application}
        onPress={() => demo.apply(job.id)}
      />
      <Button
        secondary
        label={demo.saved.includes(job.id) ? 'Remove from saved' : 'Save for later'}
        onPress={() => demo.save(job.id)}
      />
      <Text style={s.footer}>
        No application is sent. Employer verification, reporting and posting-policy enforcement are
        production requirements still to be implemented.
      </Text>
    </Screen>
  );
}
