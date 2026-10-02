import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { Switch, Text, TextInput, View } from 'react-native';
import {
  CandidateProfileSchema,
  ApproveProfileProposalSchema,
  ProfileDraftSchema,
  type CandidateProfile,
  type ProfileDraft,
} from '@swipe/contracts';
import { liveRequest, useLiveAuth } from '../src/live/auth';
import { LiveScreen, Status } from '../src/live/ui';
import { Button, Heading, s } from '../src/ui';
const empty: ProfileDraft = {
  headline: '',
  educationLevel: '',
  field: '',
  studyStatus: '',
  bullets: [],
  skills: [],
};
function ProfileVersion({ title, content }: { title: string; content: ProfileDraft }) {
  return (
    <View style={s.panel}>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={s.label}>{content.headline}</Text>
      <Text style={s.body}>
        {content.educationLevel} · {content.field} · {content.studyStatus}
      </Text>
      {content.bullets.map((bullet, index) => (
        <Text style={s.body} key={index}>
          • {bullet}
        </Text>
      ))}
      <Text style={s.body}>Skills: {content.skills.join(', ')}</Text>
    </View>
  );
}
export default function LiveProfile() {
  const auth = useLiveAuth();
  const user = auth.sessionKey;
  const identity = useRef(user);
  identity.current = user;
  const [owner, setOwner] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(empty);
  const [skills, setSkills] = useState('');
  const [bullets, setBullets] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setOwner(null);
    setProfile(null);
    setDraft(empty);
    setSkills('');
    setBullets('');
    setNotice('');
    setError('');
  }, [user]);
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      setOwner(null);
      setError('');
      setNotice('');
      setBusy(true);
      void liveRequest<{ profile: unknown }>('/candidate/profile')
        .then((result) => {
          const parsed = CandidateProfileSchema.parse(result.profile);
          if (active && identity.current === user) {
            setOwner(user);
            setProfile(parsed);
            setDraft(parsed.draft ?? empty);
            setSkills(parsed.draft?.skills.join(', ') ?? '');
            setBullets(parsed.draft?.bullets.join('\n') ?? '');
            setVisible(parsed.discoverable);
          }
        })
        .catch((failure) => {
          if (active)
            setError(failure instanceof Error ? failure.message : 'Could not load profile.');
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }, [user]),
  );
  async function updateVisibility(discoverable: boolean) {
    const actor = user;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await liveRequest<{ profile: unknown }>('/candidate/visibility', 'PATCH', {
        discoverable,
      });
      const next = CandidateProfileSchema.parse(result.profile);
      if (identity.current === actor) {
        setProfile(next);
        setVisible(next.discoverable);
        setNotice(
          next.discoverable
            ? 'Discovery enabled for your approved profile.'
            : 'Discovery disabled. Existing applications are unchanged.',
        );
      }
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Could not update discovery.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function approveProposal() {
    if (!profile?.proposal) return;
    const actor = user;
    const proposalId = profile.proposal.id;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await liveRequest<{ profile: unknown }>(
        '/candidate/profile/approve',
        'POST',
        ApproveProfileProposalSchema.parse({ proposalId }),
      );
      const next = CandidateProfileSchema.parse(result.profile);
      if (identity.current === actor) {
        setProfile(next);
        setVisible(next.discoverable);
        setNotice(
          'You approved the exact reviewed version. Eligibility checks are still separate.',
        );
      }
    } catch (failure) {
      if (identity.current === actor) {
        setError(failure instanceof Error ? failure.message : 'Could not approve this version.');
        // Refresh the proposal after conflicts; never retry a changed proposal automatically.
        try {
          const current = await liveRequest<{ profile: unknown }>('/candidate/profile');
          const next = CandidateProfileSchema.parse(current.profile);
          if (identity.current === actor) {
            setProfile(next);
            setVisible(next.discoverable);
          }
        } catch {
          /* Keep the original failure visible; no approval is inferred. */
        }
      }
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function save() {
    const actor = user;
    setError('');
    setNotice('');
    const parsed = ProfileDraftSchema.safeParse({
      ...draft,
      skills: skills
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      bullets: bullets
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
      );
      return;
    }
    setBusy(true);
    try {
      const result = await liveRequest<{ profile: unknown }>('/candidate/profile', 'PUT', {
        draft: parsed.data,
        discoverable: visible,
      });
      const next = CandidateProfileSchema.parse(result.profile);
      if (identity.current === actor) {
        setProfile(next);
        setVisible(next.discoverable);
        setDraft(next.draft ?? empty);
        setSkills(next.draft?.skills.join(', ') ?? '');
        setBullets(next.draft?.bullets.join('\n') ?? '');
        setNotice('Draft saved for review. It is not automatically published to employers.');
      }
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Could not save profile.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  if (!auth.session)
    return (
      <LiveScreen>
        <Heading eyebrow="BLIND PROFILE" title="Sign in to continue." />
        <Link href="/account" style={s.link}>
          Open account connection →
        </Link>
      </LiveScreen>
    );
  const unsavedChanges =
    !!profile &&
    JSON.stringify({
      ...draft,
      skills: skills
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      bullets: bullets
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
    }) !== JSON.stringify(profile.draft ?? empty);
  return (
    <LiveScreen>
      <Heading
        eyebrow="LIVE BLIND PROFILE"
        title="Lead with your strengths."
        subtitle="Leave your name, contact details, school name and date of birth out of this profile."
      />
      {!!error && <Status error message={error} />} {!!notice && <Status message={notice} />}{' '}
      {owner !== user && !error && <Status message="Loading profile…" />}
      {owner === user && profile && (
        <>
          {profile.proposal && (
            <>
              <View style={s.panel}>
                <Text style={s.cardTitle}>Your reviewed blind proposal</Text>
                <Text style={s.body}>
                  A reviewer prepared this version from submitted draft{' '}
                  {profile.proposal.draftRevision}. Read every field before approving. This proposal
                  is not published until you approve this exact version.
                </Text>
                <Text style={s.body}>
                  To request changes, edit and save your draft below. That starts a new review and
                  invalidates this proposal. Your previous published version remains unchanged until
                  approval.
                </Text>
              </View>
              <ProfileVersion
                title="Proposed version for your approval"
                content={profile.proposal.content}
              />
              {profile.draft && (
                <ProfileVersion
                  title="Your submitted draft for comparison"
                  content={profile.draft}
                />
              )}
              {unsavedChanges && (
                <Status message="You have unsaved draft changes. Save them for a new review before approving a proposal." />
              )}
              <Button
                disabled={busy || unsavedChanges || profile.reviewStatus !== 'awaiting_approval'}
                label="Approve this exact version"
                onPress={() => {
                  void approveProposal();
                }}
              />
            </>
          )}
          <View style={s.panel}>
            <Text style={s.label}>Review status: {profile.reviewStatus.replaceAll('_', ' ')}</Text>
            <Text style={s.body}>
              New and edited drafts require manual review. An approved published version stays
              separate from this draft. Eligibility is checked separately by the server.
            </Text>
            {(['headline', 'educationLevel', 'field', 'studyStatus'] as const).map((field) => (
              <View key={field} style={{ gap: 8 }}>
                <Text style={s.label}>
                  {
                    {
                      headline: 'Headline',
                      educationLevel: 'Education level (no school name)',
                      field: 'Field of study',
                      studyStatus: 'Study status',
                    }[field]
                  }
                </Text>
                <TextInput
                  accessibilityLabel={field}
                  value={draft[field]}
                  editable={!busy}
                  maxLength={field === 'headline' ? 60 : field === 'studyStatus' ? 40 : 80}
                  onChangeText={(value) =>
                    setDraft((previous) => ({ ...previous, [field]: value }))
                  }
                  style={s.input}
                />
              </View>
            ))}
            <Text style={s.label}>Skills (up to 8, separated by commas)</Text>
            <TextInput
              accessibilityLabel="Profile skills"
              editable={!busy}
              value={skills}
              onChangeText={setSkills}
              style={s.input}
            />
            <Text style={s.label}>Impact bullets (up to 3, one per line)</Text>
            <TextInput
              accessibilityLabel="Profile impact bullets"
              multiline
              editable={!busy}
              value={bullets}
              onChangeText={setBullets}
              style={[s.input, { minHeight: 120, textAlignVertical: 'top' }]}
            />
            <View style={s.row}>
              <Text style={[s.label, { flex: 1 }]}>Allow discovery after approval</Text>
              <Switch
                accessibilityLabel="Live profile discoverability"
                value={visible}
                disabled={busy}
                onValueChange={(value) => {
                  void updateVisibility(value);
                }}
              />
            </View>
            <Text style={s.body}>Turning discovery off does not withdraw active applications.</Text>
            <Button
              disabled={busy}
              label={busy ? 'Saving…' : 'Save draft for review'}
              onPress={() => {
                void save();
              }}
            />
          </View>
          {profile.published && (
            <View style={s.panel}>
              <Text style={s.cardTitle}>Currently approved version</Text>
              <Text style={s.label}>{profile.published.headline}</Text>
              <Text style={s.body}>
                {profile.published.educationLevel} · {profile.published.field} ·{' '}
                {profile.published.studyStatus}
              </Text>
              {profile.published.bullets.map((bullet, index) => (
                <Text key={index} style={s.body}>
                  • {bullet}
                </Text>
              ))}
              <Text style={s.body}>{profile.published.skills.join(', ')}</Text>
            </View>
          )}
        </>
      )}
      <Link href="/live" style={s.link}>
        Back to live jobs and applications →
      </Link>
    </LiveScreen>
  );
}
