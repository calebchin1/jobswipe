import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useDemo } from '../src/demo';
import { Button, Heading, Screen, s, Tag } from '../src/ui';

export default function Onboarding() {
  const demo = useDemo();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [headline, setHeadline] = useState(demo.headline);
  const [hours, setHours] = useState(demo.hours);
  return (
    <Screen>
      <Heading
        eyebrow={`DEMO SETUP · STEP ${step + 1} OF 3`}
        title={
          ['Lead with your strengths.', 'Make room for life.', 'Meet your blind profile.'][step]!
        }
        subtitle="Use fictional information in this local prototype."
      />
      {step === 0 && (
        <View style={s.panel}>
          <Text style={s.label}>Your introduction</Text>
          <Text style={s.body}>
            One line about what you bring. Leave names, school names and contact details out.
          </Text>
          <TextInput
            accessibilityLabel="Fictional profile headline"
            maxLength={60}
            value={headline}
            onChangeText={setHeadline}
            style={s.input}
          />
          <Text style={s.body}>{headline.length}/60</Text>
          <Text style={s.body}>
            Education, skills and impact bullets use the sample profile for this walkthrough. Resume
            upload is optional in the planned live flow.
          </Text>
        </View>
      )}
      {step === 1 && (
        <View style={s.panel}>
          <Text style={s.label}>How much work fits your week?</Text>
          {['8–12 hours / week', '12–18 hours / week', '20–25 hours / week'].map((option) => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: hours === option }}
              onPress={() => setHours(option)}
              style={[s.button, hours === option ? {} : s.secondary]}
            >
              <Text style={[s.buttonText, hours !== option && { color: '#243F37' }]}>
                {hours === option ? '✓  ' : ''}
                {option}
              </Text>
            </Pressable>
          ))}
          <Text style={s.body}>
            Demo location: Waterloo. Commute values and job suggestions remain illustrative.
          </Text>
        </View>
      )}
      {step === 2 && (
        <View style={s.panel}>
          <Tag>Candidate A7F2</Tag>
          <Text style={s.cardTitle}>{headline.trim()}</Text>
          <Text style={s.body}>Bachelor’s · Mathematics · Year 1</Text>
          <Text style={s.body}>{hours} · Waterloo</Text>
          <View style={s.row}>
            <Tag>Communication</Tag>
            <Tag>Math</Tag>
            <Tag>Teamwork</Tag>
          </View>
          <Text style={s.body}>
            This is a local preview. Live profiles must be reviewed before employers can see them.
            No date of birth, name or contact details is collected here.
          </Text>
        </View>
      )}
      {step < 2 ? (
        <Button label="Continue →" disabled={!headline.trim()} onPress={() => setStep(step + 1)} />
      ) : (
        <Button
          label="Save demo profile"
          onPress={() => {
            demo.setHeadline(headline.trim());
            demo.setHours(hours);
            router.replace('/profile');
          }}
        />
      )}
      {step > 0 && <Button label="Back" secondary onPress={() => setStep(step - 1)} />}
    </Screen>
  );
}
