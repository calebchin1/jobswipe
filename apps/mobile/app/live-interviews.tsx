import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import {
  InterviewSlotSchema,
  LiveApplicationSchema,
  ScheduledInterviewSchema,
  type InterviewSlot,
  type LiveApplication,
  type ScheduledInterview,
} from '@swipe/contracts';
import { liveRequest, useLiveAuth } from '../src/live/auth';
import { LiveScreen, Status } from '../src/live/ui';
import { Button, Empty, Heading, s, Tag } from '../src/ui';
const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export function interviewDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}
export default function LiveInterviews() {
  const auth = useLiveAuth();
  const user = auth.sessionKey;
  const identity = useRef(user);
  identity.current = user;
  const params = useLocalSearchParams<{ applicationId?: string }>();
  const [applications, setApplications] = useState<LiveApplication[]>([]);
  const [interviews, setInterviews] = useState<ScheduledInterview[]>([]);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [owner, setOwner] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [slot, setSlot] = useState<InterviewSlot | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const revision = useRef(0);
  useEffect(() => {
    setOwner(null);
    setApplications([]);
    setInterviews([]);
    setSlots([]);
    setSelected(null);
    setSlot(null);
    setCancelId(null);
    setReason('');
    setError('');
    setNotice('');
    revision.current++;
  }, [user]);
  const load = useCallback(
    async (clearError = true) => {
      if (!user) return;
      const request = ++revision.current;
      setBusy(true);
      if (clearError) setError('');
      try {
        const [apps, result] = await Promise.all([
          liveRequest<{ applications: unknown[] }>('/candidate/applications'),
          liveRequest<{ interviews: unknown[] }>('/candidate/interviews'),
        ]);
        const nextApps = apps.applications.map((value) => LiveApplicationSchema.parse(value));
        const nextInterviews = result.interviews.map((value) =>
          ScheduledInterviewSchema.parse(value),
        );
        if (identity.current !== user || request !== revision.current) return;
        setApplications(nextApps);
        setInterviews(nextInterviews);
        setOwner(user);
        const applicationId = selected ?? params.applicationId ?? null;
        const application = nextApps.find((value) => value.id === applicationId);
        const active = nextInterviews.some(
          (value) => value.applicationId === applicationId && value.status === 'scheduled',
        );
        if (application && application.stage === 'Matched' && !active) {
          const result = await liveRequest<{ slots: unknown[] }>(
            `/applications/${application.id}/interview-slots`,
          );
          const nextSlots = result.slots.map((value) => InterviewSlotSchema.parse(value));
          if (identity.current === user && request === revision.current) {
            setSelected(application.id);
            setSlots(
              nextSlots.filter(
                (value) => value.status === 'available' && Date.parse(value.startsAt) > Date.now(),
              ),
            );
          }
        } else if (identity.current === user && request === revision.current) {
          setSlots([]);
          setSlot(null);
        }
      } catch (failure) {
        if (identity.current === user && request === revision.current) {
          setError(failure instanceof Error ? failure.message : 'Could not load interviews.');
          setSlots([]);
        }
      } finally {
        if (identity.current === user && request === revision.current) setBusy(false);
      }
    },
    [user, selected, params.applicationId],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        revision.current++;
      };
    }, [load]),
  );
  async function book() {
    if (!slot || !selected) return;
    const actor = user;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await liveRequest<{ interview: unknown }>(
        `/applications/${selected}/interviews`,
        'POST',
        { slotId: slot.id },
      );
      ScheduledInterviewSchema.parse(result.interview);
      if (identity.current === actor) {
        setSlot(null);
        setNotice('Your interview is booked. The time below is confirmed by the server.');
        await load(false);
      }
    } catch (failure) {
      if (identity.current === actor) {
        setError(failure instanceof Error ? failure.message : 'Booking failed.');
        setSlot(null);
        await load(false);
      }
    } finally {
      if (identity.current === actor) setBusy(false);
    }
  }
  async function cancel() {
    if (!cancelId) return;
    const actor = user;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await liveRequest<{ interview: unknown }>(
        `/interviews/${cancelId}/cancel`,
        'POST',
        reason.trim() ? { reason: reason.trim() } : {},
      );
      ScheduledInterviewSchema.parse(result.interview);
      if (identity.current === actor) {
        setCancelId(null);
        setReason('');
        setNotice(
          'Interview cancelled. Your application remains active unless separately withdrawn.',
        );
        await load(false);
      }
    } catch (failure) {
      if (identity.current === actor) {
        setError(failure instanceof Error ? failure.message : 'Cancellation failed.');
        await load(false);
      }
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
        <Heading eyebrow="INTERVIEWS" title="Sign in to continue." />
        <Link href="/account" style={s.link}>
          Open account connection →
        </Link>
      </LiveScreen>
    );
  const matched = applications.filter(
    (application) =>
      application.stage === 'Matched' &&
      !interviews.some(
        (interview) =>
          interview.applicationId === application.id && interview.status === 'scheduled',
      ),
  );
  const chosen = applications.find((application) => application.id === selected);
  return (
    <LiveScreen>
      <Heading
        eyebrow="YOUR FIRST CONVERSATION"
        title="Make time to meet."
        subtitle={`All times are shown in your device time zone: ${deviceZone()}.`}
      />
      <Text style={s.body}>
        Booking reserves a first interview. Audio calls, reminders and calendar invitations are not
        connected yet. Booking or cancellation never completes an interview or shares your identity.
      </Text>
      <Button
        secondary
        disabled={busy}
        label={busy ? 'Loading…' : 'Refresh interview availability'}
        onPress={() => {
          setSlot(null);
          void load();
        }}
      />
      {!!error && <Status error message={error} />} {!!notice && <Status message={notice} />}{' '}
      {owner !== user && !error && <Status message="Loading interviews…" />}
      {owner === user && (
        <>
          <Heading eyebrow="CONFIRMED SCHEDULE" title="Your interviews." />
          {interviews.length === 0 && (
            <Empty
              title="No interviews booked yet."
              description="A mutual match unlocks the employer’s available times."
            />
          )}
          {interviews.map((interview) => (
            <View key={interview.id} style={s.panel}>
              <Tag>{interview.status.replaceAll('_', ' ')}</Tag>
              <Text style={s.cardTitle}>{interview.jobTitle}</Text>
              <Text style={s.body}>{interview.company}</Text>
              <Text style={s.label}>{interviewDate(interview.startsAt)}</Text>
              <Text style={s.body}>Until {interviewDate(interview.endsAt)} · First interview</Text>
              <Text style={s.body}>Employer’s scheduling time zone: {interview.timeZone}</Text>
              {interview.status === 'scheduled' && interview.isParticipant === true && (
                <Link
                  href={{ pathname: '/live-audio', params: { interviewId: interview.id } }}
                  style={s.link}
                >
                  Open audio lobby →
                </Link>
              )}
              {interview.status === 'scheduled' &&
                (cancelId === interview.id ? (
                  <>
                    <Text style={s.body}>
                      Cancel this reservation? You can choose another available slot afterwards.
                      This does not withdraw your application.
                    </Text>
                    <TextInput
                      accessibilityLabel="Optional interview cancellation reason"
                      editable={!busy}
                      value={reason}
                      onChangeText={setReason}
                      maxLength={500}
                      placeholder="Optional reason (leave identity details out)"
                      multiline
                      style={s.input}
                    />
                    <Button
                      disabled={busy}
                      label="Confirm interview cancellation"
                      onPress={() => {
                        void cancel();
                      }}
                    />
                    <Button
                      disabled={busy}
                      secondary
                      label="Keep interview"
                      onPress={() => {
                        setCancelId(null);
                        setReason('');
                      }}
                    />
                  </>
                ) : (
                  <Button
                    disabled={busy}
                    secondary
                    label="Cancel interview"
                    onPress={() => {
                      setCancelId(interview.id);
                      setReason('');
                      setSlot(null);
                    }}
                  />
                ))}
            </View>
          ))}
          <Heading eyebrow="MATCHED APPLICATIONS" title="Choose a time." />
          {matched.length === 0 && (
            <Empty
              title="No matches need booking."
              description="Your application must be mutually matched, with no existing scheduled interview, before you can reserve a time."
            />
          )}
          {matched.map((application) => (
            <View key={application.id} style={s.panel}>
              <Text style={s.cardTitle}>{application.jobTitle}</Text>
              <Text style={s.body}>{application.company}</Text>
              <Button
                secondary
                disabled={busy || selected === application.id}
                label={
                  selected === application.id
                    ? 'Viewing available times'
                    : 'See available interview times'
                }
                onPress={() => {
                  setSlot(null);
                  setSlots([]);
                  setSelected(application.id);
                  setError('');
                  setNotice('');
                }}
              />
            </View>
          ))}
          {chosen && matched.some((application) => application.id === chosen.id) && (
            <View style={s.panel}>
              <Text style={s.cardTitle}>{chosen.company}: available times</Text>
              {slots.length === 0 && !busy && (
                <Text style={s.body}>
                  No available times right now. Refresh later; no time is reserved until booking is
                  confirmed.
                </Text>
              )}
              {slots.map((value) => (
                <Button
                  key={value.id}
                  secondary
                  disabled={busy}
                  label={`${interviewDate(value.startsAt)} → ${interviewDate(value.endsAt)}`}
                  onPress={() => {
                    setSlot(value);
                    setCancelId(null);
                  }}
                />
              ))}
              {slot && (
                <>
                  <Text style={s.label}>
                    Confirm {interviewDate(slot.startsAt)} until {interviewDate(slot.endsAt)} for{' '}
                    {chosen.jobTitle}?
                  </Text>
                  <Text style={s.body}>
                    Availability is rechecked when you confirm. A slot may be taken by another
                    candidate before then.
                  </Text>
                  <Button
                    disabled={busy}
                    label="Confirm interview booking"
                    onPress={() => {
                      void book();
                    }}
                  />
                  <Button
                    secondary
                    disabled={busy}
                    label="Choose a different time"
                    onPress={() => setSlot(null)}
                  />
                </>
              )}
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
