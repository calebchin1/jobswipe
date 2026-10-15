import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import {
  AccountContextSchema,
  CandidateProfileSchema,
  LiveApplicationSchema,
  LiveJobSchema,
  type AccountContext,
  type CandidateProfile,
  type LiveApplication,
  type LiveJob,
} from '@swipe/contracts';
import { liveRequest, useLiveAuth } from '../src/live/auth';
import { LiveScreen, Status } from '../src/live/ui';
import { Button, colors, Empty, Heading, s, Tag } from '../src/ui';
import { DeckButtons, DeckStack, MatchOverlay, type DeckCardContent } from '../src/Deck';
import { useRouter } from 'expo-router';
export default function Live() {
  const auth = useLiveAuth();
  const userId = auth.sessionKey;
  const identity = useRef(userId);
  identity.current = userId;
  const [data, setData] = useState<{
    user: string;
    account: AccountContext;
    profile: CandidateProfile;
    jobs: LiveJob[];
    applications: LiveApplication[];
    nextCursor: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [passed, setPassed] = useState<LiveJob[]>([]);
  const [match, setMatch] = useState<{ title: string; applicationId: string } | null>(null);
  const router = useRouter();
  const sequence = useRef(0);
  useEffect(() => {
    setData(null);
    setError('');
    setNotice('');
    setConfirm(null);
    setPassed([]);
    sequence.current++;
  }, [userId]);
  const refresh = useCallback(async () => {
    if (!userId) return;
    const request = ++sequence.current;
    setBusy(true);
    setError('');
    try {
      const [context, profile, jobs, applications] = await Promise.all([
        liveRequest<{ account: unknown }>('/me'),
        liveRequest<{ profile: unknown }>('/candidate/profile'),
        liveRequest<{ jobs: unknown[]; nextCursor: string | null }>('/candidate/jobs?limit=20'),
        liveRequest<{ applications: unknown[] }>('/candidate/applications'),
      ]);
      const next = {
        user: userId,
        account: AccountContextSchema.parse(context.account),
        profile: CandidateProfileSchema.parse(profile.profile),
        jobs: jobs.jobs.map((job) => LiveJobSchema.parse(job)),
        applications: applications.applications.map((application) =>
          LiveApplicationSchema.parse(application),
        ),
        nextCursor: jobs.nextCursor,
      };
      if (identity.current === userId && request === sequence.current) setData(next);
    } catch (failure) {
      if (identity.current === userId && request === sequence.current) {
        setData(null);
        setError(failure instanceof Error ? failure.message : 'Could not load your workspace.');
      }
    } finally {
      if (identity.current === userId && request === sequence.current) setBusy(false);
    }
  }, [userId]);
  useFocusEffect(
    useCallback(() => {
      setConfirm(null);
      setNotice('');
      void refresh();
      return () => {
        sequence.current++;
      };
    }, [refresh]),
  );
  async function mutate(path: string, message: string) {
    const actor = userId;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await liveRequest(path, 'POST', {});
      if (identity.current === actor) {
        setConfirm(null);
        setNotice(message);
        await refresh();
      }
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Request failed.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function apply(job: LiveJob) {
    const actor = userId;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { applicationId } = await liveRequest<{ applicationId: string }>(
        `/jobs/${job.id}/apply`,
        'POST',
        {},
      );
      if (identity.current !== actor) return;
      setNotice('Application received by the server.');
      const mine = await liveRequest<{ applications: unknown[] }>('/candidate/applications');
      const stage = mine.applications
        .map((item) => LiveApplicationSchema.parse(item))
        .find((item) => item.id === applicationId)?.stage;
      if (identity.current === actor && stage === 'Matched')
        setMatch({ title: job.details?.title ?? 'this role', applicationId });
      await refresh();
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Could not apply.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function pass(job: LiveJob) {
    const actor = userId;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await liveRequest(`/jobs/${job.id}/pass`, 'POST', {});
      if (identity.current !== actor) return;
      setPassed((previous) => [job, ...previous]);
      setData((current) =>
        current ? { ...current, jobs: current.jobs.filter((item) => item.id !== job.id) } : null,
      );
      setNotice(`Passed on ${job.details?.title ?? 'this job'}. The employer isn’t notified.`);
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Could not pass on this job.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function undoPass() {
    const [job, ...rest] = passed;
    if (!job) return;
    const actor = userId;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await liveRequest(`/jobs/${job.id}/pass/undo`, 'POST', {});
      if (identity.current !== actor) return;
      setPassed(rest);
      setData((current) => (current ? { ...current, jobs: [job, ...current.jobs] } : null));
      setNotice(`${job.details?.title ?? 'The job'} is back in your deck.`);
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Could not undo that pass.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function more() {
    if (!data?.nextCursor) return;
    const actor = userId;
    setBusy(true);
    setError('');
    try {
      const result = await liveRequest<{ jobs: unknown[]; nextCursor: string | null }>(
        `/candidate/jobs?limit=20&after=${encodeURIComponent(data.nextCursor)}`,
      );
      const jobs = result.jobs.map((job) => LiveJobSchema.parse(job));
      if (identity.current === actor)
        setData((current) =>
          current
            ? {
                ...current,
                jobs: [
                  ...current.jobs,
                  ...jobs.filter((job) => !current.jobs.some((existing) => existing.id === job.id)),
                ],
                nextCursor: result.nextCursor,
              }
            : null,
        );
    } catch (failure) {
      if (identity.current === actor)
        setError(failure instanceof Error ? failure.message : 'Could not load more jobs.');
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  if (!auth.ready)
    return (
      <LiveScreen>
        <Status message="Restoring session…" />
      </LiveScreen>
    );
  if (!auth.session)
    return (
      <LiveScreen>
        <Heading eyebrow="CONNECTED WORKSPACE" title="Sign in to continue." />
        <Link href="/account" style={s.link}>
          Open account connection →
        </Link>
      </LiveScreen>
    );
  const current = data?.user === userId ? data : null;
  return (
    <LiveScreen>
      <MatchOverlay
        visible={!!match}
        body={`The employer behind ${match?.title ?? 'this role'} is interested too. Pick an interview time once they share availability.`}
        primary={{
          label: 'Plan your interview',
          onPress: () => {
            const target = match;
            setMatch(null);
            if (target)
              router.push({
                pathname: '/live-interviews',
                params: { applicationId: target.applicationId },
              });
          },
        }}
        onClose={() => setMatch(null)}
      />
      <Heading
        eyebrow="LIVE CANDIDATE WORKSPACE"
        title="Your next possibility."
        subtitle="Jobs and application statuses come from your connected server."
      />
      <View style={s.row}>
        <Link href="/account" style={s.link}>
          Account
        </Link>
        <Link href="/live-interviews" style={s.link}>
          Interviews
        </Link>
        <Link href="/live-profile" style={s.link}>
          Edit blind profile
        </Link>
      </View>
      <Button
        secondary
        label={busy ? 'Loading…' : 'Refresh jobs and applications'}
        disabled={busy}
        onPress={() => {
          void refresh();
        }}
      />
      {!!error && <Status error message={error} />} {!!notice && <Status message={notice} />}{' '}
      {!current && !error && <Status message="Loading your workspace…" />}
      {current && (
        <>
          <View style={s.panel}>
            <Text style={s.cardTitle}>
              Profile: {current.profile.reviewStatus.replaceAll('_', ' ')}
            </Text>
            <Text style={s.body}>
              {current.profile.reviewStatus === 'approved'
                ? 'Your profile has been reviewed. Each job still requires server eligibility checks.'
                : current.profile.reviewStatus === 'awaiting_approval'
                  ? 'Review the proposed blind version in Edit blind profile. It stays unpublished until you approve it.'
                  : 'Save your blind profile for review. Applying is unavailable until required profile and eligibility checks are complete.'}
            </Text>
            <Text style={s.body}>
              Discoverability: {current.profile.discoverable ? 'enabled' : 'disabled'}. Account:{' '}
              {current.account.status}.
            </Text>
          </View>
          <Heading eyebrow="OPEN POSTINGS" title="Explore jobs." />
          {(() => {
            const deck = current.jobs.filter(
              (job) => !current.applications.some((application) => application.jobId === job.id),
            );
            const job = deck[0];
            if (!job)
              return (
                <>
                  <Empty
                    title={passed.length ? 'You’re all caught up.' : 'No available jobs yet.'}
                    description={
                      passed.length
                        ? 'You’ve seen every open job. Refresh later for new postings.'
                        : 'Refresh later. No fictional listings are substituted here.'
                    }
                  />
                  {!!passed.length && (
                    <Button
                      secondary
                      disabled={busy}
                      label="Undo last pass"
                      onPress={() => void undoPass()}
                    />
                  )}
                </>
              );
            const canApply = job.canApply && current.account.status === 'active';
            const toCard = (item: LiveJob): DeckCardContent => {
              const d = item.details;
              return {
                id: item.id,
                monogram: `${item.company.charAt(0).toLowerCase()}.`,
                title: d?.title ?? 'Posting unavailable',
                subtitle: `${item.company}${d ? ` · ${d.location}` : ''}`,
                highlight: d
                  ? `$${(d.payMinMinor / 100).toFixed(2)}–$${(d.payMaxMinor / 100).toFixed(2)} CAD / ${d.payPeriod}`
                  : '',
                chips: d ? [`${d.hoursPerWeek} hrs/week`, ...d.skills] : [],
                note:
                  item.canApply && current.account.status === 'active'
                    ? undefined
                    : 'Profile review or eligibility requirements are not yet satisfied for this job. Approval cannot be granted in this app.',
                details: d && (
                  <>
                    <Text style={s.label}>About the role</Text>
                    <Text style={s.body}>{d.description}</Text>
                    <Text style={s.label}>Schedule</Text>
                    <Text style={s.body}>
                      {d.hoursPerWeek} hours/week · {d.schedule.join(', ')}
                    </Text>
                    <Text style={s.label}>Requirements</Text>
                    {d.mustHaves.map((requirement) => (
                      <Text key={requirement} style={s.body}>
                        • {requirement}
                      </Text>
                    ))}
                    <Text style={s.body}>
                      Existing vacancy: {d.isVacancy ? 'yes' : 'no'} · AI screening:{' '}
                      {d.usesAiScreening ? 'yes' : 'no'}
                    </Text>
                  </>
                ),
              };
            };
            return (
              <>
                <Text style={s.body} accessibilityLiveRegion="polite">
                  {deck.length} {deck.length === 1 ? 'job' : 'jobs'} in your deck
                </Text>
                <DeckStack
                  cards={deck.slice(0, 2).map(toCard)}
                  rightLabel="Apply"
                  canSwipe={(direction) => {
                    if (busy) return false;
                    if (direction === 'right' && !canApply) {
                      setNotice('Application checks are still pending for this job.');
                      return false;
                    }
                    return true;
                  }}
                  onSwipe={(_, direction) => {
                    if (direction === 'left') void pass(job);
                    else void apply(job);
                  }}
                />
                <DeckButtons
                  actions={[
                    {
                      label: 'Undo last pass',
                      caption: 'Undo',
                      glyph: '↶',
                      color: colors.gold,
                      disabled: busy || !passed.length,
                      onPress: () => void undoPass(),
                    },
                    {
                      label: 'Pass',
                      glyph: '✕',
                      color: colors.red,
                      big: true,
                      disabled: busy,
                      onPress: () => void pass(job),
                    },
                    {
                      label: canApply ? 'Apply to this job' : 'Application checks pending',
                      caption: canApply ? 'Apply' : 'Pending',
                      glyph: '✓',
                      color: colors.green,
                      big: true,
                      disabled: busy || !canApply,
                      onPress: () => void apply(job),
                    },
                  ]}
                />
              </>
            );
          })()}
          {current.nextCursor && (
            <Button
              secondary
              label="Load more jobs"
              disabled={busy}
              onPress={() => {
                void more();
              }}
            />
          )}
          <Heading eyebrow="YOUR APPLICATIONS" title="Keep track." />
          {current.applications.length === 0 && (
            <Empty
              title="No applications yet."
              description="Your confirmed applications will appear here after you apply."
            />
          )}
          {current.applications.map((application) => (
            <View style={s.panel} key={application.id}>
              <Tag>{application.stage}</Tag>
              <Text style={s.cardTitle}>{application.jobTitle}</Text>
              <Text style={s.body}>{application.company}</Text>
              <Text style={s.body}>
                Applied {new Date(application.appliedAt).toLocaleDateString()}
              </Text>
              {application.matchedAt && (
                <Text style={s.body}>
                  Matched {new Date(application.matchedAt).toLocaleDateString()}. Choose an
                  interview time when the employer offers availability.
                </Text>
              )}
              {(application.stage === 'Matched' || application.stage === 'Interview booked') && (
                <Link
                  href={{ pathname: '/live-interviews', params: { applicationId: application.id } }}
                  style={s.link}
                >
                  Manage interview →
                </Link>
              )}
              {application.stage !== 'Withdrawn' &&
                (confirm === application.id ? (
                  <>
                    <Text style={s.body}>
                      Withdraw this application? Future access will stop. Copies already shared
                      outside the platform cannot be recalled.
                    </Text>
                    <Button
                      disabled={busy}
                      label="Confirm live withdrawal"
                      onPress={() => {
                        void mutate(
                          `/applications/${application.id}/withdraw`,
                          'Application withdrawn.',
                        );
                      }}
                    />
                    <Button
                      secondary
                      disabled={busy}
                      label="Keep application"
                      onPress={() => setConfirm(null)}
                    />
                  </>
                ) : (
                  <Button
                    secondary
                    disabled={busy}
                    label="Withdraw application"
                    onPress={() => setConfirm(application.id)}
                  />
                ))}
            </View>
          ))}
        </>
      )}
    </LiveScreen>
  );
}
