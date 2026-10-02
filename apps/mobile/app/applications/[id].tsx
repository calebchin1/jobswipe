import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { jobs, useDemo } from '../../src/demo';
import { Button, Empty, Heading, Screen, s, Tag } from '../../src/ui';
export default function ApplicationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const demo = useDemo();
  const [confirm, setConfirm] = useState(false);
  const application = demo.applications.find((a) => a.jobId === id);
  const job = jobs.find((j) => j.id === id);
  if (!application || !job)
    return (
      <Screen>
        <Empty
          title="Application unavailable"
          description="Apply to a sample job to begin your timeline."
        />
      </Screen>
    );
  const withdrawn = application.stage === 'Withdrawn';
  return (
    <Screen>
      <Heading
        eyebrow={job.company}
        title={job.category}
        subtitle="Candidate A7F2 · Fictional application"
      />
      <View style={s.row}>
        <Tag>{application.stage}</Tag>
        <Tag>Identity hidden</Tag>
      </View>
      <View style={s.panel}>
        <Text style={s.cardTitle}>Your timeline</Text>
        {(withdrawn
          ? ['Applied', 'Withdrawn']
          : ['Applied', 'Matched', 'Interview booked', 'Interviewed', 'Revealed', 'Decision']
        ).map((stage, index) => (
          <View key={stage} style={{ flexDirection: 'row', gap: 16, paddingVertical: 9 }}>
            <Text style={{ color: index === 0 || withdrawn ? '#295C46' : '#A3AD9C', fontSize: 18 }}>
              {index === 0 || withdrawn ? '●' : '○'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>{stage}</Text>
              <Text style={s.body}>
                {index === 0
                  ? 'Recorded in this demo session.'
                  : withdrawn
                    ? 'No further progress on this application.'
                    : 'Not reached.'}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={s.panel}>
        <Text style={s.cardTitle}>
          {withdrawn ? 'You’re in control.' : 'The next step is mutual.'}
        </Text>
        <Text style={s.body}>
          {withdrawn
            ? 'This sample application is closed. You can explore the remaining demo jobs.'
            : 'An application becomes a match when the employer is interested too. Chat and interview booking will become available after a confirmed match in the live app.'}
        </Text>
      </View>
      {!withdrawn &&
        (confirm ? (
          <View style={s.panel}>
            <Text style={s.cardTitle}>Withdraw this application?</Text>
            <Text style={s.body}>
              Withdrawal closes this demo application. In the live app, future access will stop, but
              already downloaded or emailed copies cannot be recalled.
            </Text>
            <Button
              label="Confirm withdrawal"
              onPress={() => {
                demo.withdraw(id);
                setConfirm(false);
              }}
            />
            <Button secondary label="Keep application" onPress={() => setConfirm(false)} />
          </View>
        ) : (
          <Button secondary label="Withdraw application" onPress={() => setConfirm(true)} />
        ))}
    </Screen>
  );
}
