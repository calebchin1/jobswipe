import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { useDemo } from '../../src/demo';
import { Button, Heading, Screen, s, Tag } from '../../src/ui';
export default function Profile() {
  const demo = useDemo();
  const [draft, setDraft] = useState(demo.headline);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setDraft(demo.headline);
    setSaved(false);
  }, [demo.headline]);
  return (
    <Screen>
      <Link href="/account" style={s.link}>
        Connect a real candidate account →
      </Link>
      <Heading
        eyebrow="SKILLS FIRST. ALWAYS."
        title="More than a name."
        subtitle="A preview of the anonymous profile employers would see."
      />
      <View style={s.panel}>
        <View style={s.row}>
          <Tag>Candidate A7F2</Tag>
          <Tag>Sample profile</Tag>
        </View>
        <Text style={s.cardTitle}>{demo.headline}</Text>
        <Text style={s.body}>Bachelor’s · Mathematics · Year 1</Text>
        <View style={s.divider} />
        {[
          'Helped 12 peers prepare for first-year math exams.',
          'Organized a weekly study group with shared practice notes.',
          'Supported customers during busy weekend shifts.',
        ].map((b) => (
          <Text style={s.body} key={b}>
            • {b}
          </Text>
        ))}
        <View style={s.row}>
          {['Communication', 'Math', 'Teamwork'].map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </View>
        <Text style={s.label}>{demo.hours} · Waterloo</Text>
      </View>
      <Link href="/onboarding" style={s.link}>
        Try the guided profile setup →
      </Link>
      <View style={s.panel}>
        <Text style={s.cardTitle}>Try your introduction</Text>
        <Text style={s.body}>
          Use fictional content only. Live profiles will require review before publication.
        </Text>
        <Text style={s.label} nativeID="headline-label">
          Headline
        </Text>
        <TextInput
          accessibilityLabel="Demo profile headline"
          maxLength={60}
          value={draft}
          onChangeText={(value) => {
            setDraft(value);
            setSaved(false);
          }}
          style={s.input}
        />
        <Text style={s.footer}>{draft.length}/60 characters</Text>
        <Button
          label="Save demo headline"
          disabled={!draft.trim()}
          onPress={() => {
            demo.setHeadline(draft.trim());
            setSaved(true);
          }}
        />
        {saved && (
          <Text accessibilityLiveRegion="polite" style={s.body}>
            Saved in this demo session.
          </Text>
        )}
      </View>
      <View style={s.panel}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Discoverable profile</Text>
            <Text style={s.body}>
              {demo.visible ? 'Demo visibility is on.' : 'Demo visibility is off.'}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Demo profile discoverability"
            value={demo.visible}
            onValueChange={demo.setVisible}
            trackColor={{ true: '#295C46' }}
          />
        </View>
        <Text style={s.body}>
          In the live app, hiding your profile will stop new discovery. Existing applications will
          remain active.
        </Text>
      </View>
      <View style={s.panel}>
        <Text style={s.cardTitle}>Your identity, your choice.</Text>
        <Text style={s.body}>
          No name, photo, school name, contact details, or date of birth appears on this preview.
          Resume upload and identity sharing are not connected in this prototype.
        </Text>
      </View>
      <Button
        secondary
        label="Reset demo session"
        onPress={() => {
          demo.reset();
          setDraft('Curious math student, great with people');
          setSaved(false);
        }}
      />
    </Screen>
  );
}
