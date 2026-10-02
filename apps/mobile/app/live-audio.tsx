import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Platform, Text, View } from 'react-native';
import {
  AudioSessionSchema,
  ScheduledInterviewSchema,
  UuidSchema,
  type AudioSession,
  type ScheduledInterview,
} from '@swipe/contracts';
import { liveRequest, useLiveAuth } from '../src/live/auth';
import { LiveScreen, Status } from '../src/live/ui';
import { Button, Heading, s, Tag } from '../src/ui';
import AudioRoom from '../src/calls/AudioRoom';
export default function LiveAudio() {
  const auth = useLiveAuth();
  const { interviewId } = useLocalSearchParams<{ interviewId?: string }>();
  const key = auth.sessionKey;
  const identity = useRef(key);
  identity.current = key;
  const focused = useRef(false);
  const revision = useRef(0);
  const [interview, setInterview] = useState<ScheduledInterview | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ owner: string; session: AudioSession } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setJoined(null);
    setInterview(null);
    setOwner(null);
    setError('');
    setNotice('');
    revision.current++;
  }, [key, interviewId]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const request = ++revision.current;
      if (key && UuidSchema.safeParse(interviewId).success) {
        setBusy(true);
        void liveRequest<{ interviews: unknown[] }>('/candidate/interviews')
          .then((result) => {
            const items = result.interviews.map((value) => ScheduledInterviewSchema.parse(value));
            const found = items.find((value) => value.id === interviewId) ?? null;
            if (focused.current && identity.current === key && revision.current === request) {
              setInterview(found);
              setOwner(key);
              if (!found) setError('This interview is unavailable to this account.');
            }
          })
          .catch(() => {
            if (focused.current && identity.current === key && revision.current === request)
              setError('Could not load your interview. Return to the schedule and refresh.');
          })
          .finally(() => {
            if (focused.current && identity.current === key && revision.current === request)
              setBusy(false);
          });
      } else if (key) setError('Invalid interview link.');
      return () => {
        focused.current = false;
        revision.current++;
        setJoined(null);
      };
    }, [key, interviewId]),
  );
  useEffect(() => {
    if (!joined || joined.owner !== key || !interview) return;
    let active = true;
    const disconnectUncertain = () => {
      if (!active) return;
      setJoined(null);
      setError(
        'Audio access could not be confirmed. You were disconnected; refresh the schedule before rejoining.',
      );
    };
    const timer = setInterval(() => {
      void liveRequest<{ session: unknown }>(
        `/interviews/${joined.session.interviewId}/audio-session`,
        'POST',
        {},
      )
        .then((result) => {
          const next = AudioSessionSchema.parse(result.session);
          if (next.interviewId !== joined.session.interviewId) disconnectUncertain();
          // Revalidation does not replace the in-memory connection token or reconnect a healthy room.
        })
        .catch(disconnectUncertain);
    }, 30_000);
    const end = setTimeout(
      () => {
        if (active) {
          setJoined(null);
          setNotice('The audio join window has ended. Your local connection was closed.');
        }
      },
      Math.max(0, Date.parse(interview.endsAt) + 15 * 60_000 - Date.now()),
    );
    return () => {
      active = false;
      clearInterval(timer);
      clearTimeout(end);
    };
  }, [joined, key, interview]);
  const leave = useCallback(() => {
    setJoined(null);
    setNotice('You left the local audio connection. Interview status is unchanged.');
  }, []);
  async function join() {
    if (!key || !interview || interview.isParticipant !== true) return;
    const request = revision.current;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await liveRequest<{ session: unknown }>(
        `/interviews/${interview.id}/audio-session`,
        'POST',
        {},
      );
      const session = AudioSessionSchema.parse(result.session);
      if (session.interviewId !== interview.id || Date.parse(session.expiresAt) <= Date.now())
        throw new Error('Audio authorization expired. Try joining again.');
      if (focused.current && identity.current === key && revision.current === request)
        setJoined({ owner: key, session });
    } catch (failure) {
      if (focused.current && identity.current === key && revision.current === request)
        setError(failure instanceof Error ? failure.message : 'Audio is unavailable.');
    } finally {
      if (focused.current && identity.current === key && revision.current === request)
        setBusy(false);
    }
  }
  if (!auth.session)
    return (
      <LiveScreen>
        <Heading eyebrow="BLIND AUDIO" title="Sign in to continue." />
        <Link href="/account" style={s.link}>
          Open account connection →
        </Link>
      </LiveScreen>
    );
  const current = owner === key ? interview : null;
  const room = joined?.owner === key ? joined.session : null;
  return (
    <LiveScreen>
      <Heading
        eyebrow="DEVELOPMENT AUDIO INTERVIEW"
        title="Let your answers lead."
        subtitle="Your first conversation uses audio only."
      />
      {!!error && <Status error message={error} />} {!!notice && <Status message={notice} />}{' '}
      {!current && !error && <Status message="Loading your interview…" />}
      {current && (
        <View style={s.panel}>
          <Text style={s.cardTitle}>{current.jobTitle}</Text>
          <Text style={s.body}>{current.company}</Text>
          <Text style={s.body}>
            {new Date(current.startsAt).toLocaleString()} ·{' '}
            {Intl.DateTimeFormat().resolvedOptions().timeZone}
          </Text>
          <Tag>{current.status}</Tag>
          <Text style={s.body}>
            No camera, screen sharing or recording is available. Your voice and anything you say may
            identify you; keep names and contact details out of the first conversation.
          </Text>
          {Platform.OS !== 'web' && (
            <Text style={s.body}>
              Development calls run in the foreground. Leaving the app ends your local audio
              connection.
            </Text>
          )}
        </View>
      )}
      {room ? (
        <>
          <Text style={s.label}>You are joining as {room.participantName}.</Text>
          <AudioRoom session={room} onLeave={leave} />
        </>
      ) : current?.status === 'scheduled' && current.isParticipant === true ? (
        <>
          <Text style={s.body}>
            Join muted, then choose whether to enable your microphone. Joining does not complete an
            interview or authorize identity sharing.
          </Text>
          <Button
            disabled={busy}
            label={busy ? 'Requesting audio access…' : 'Join audio interview muted'}
            onPress={() => {
              void join();
            }}
          />
        </>
      ) : (
        current && (
          <Status message="Audio joining is not available for this interview or participant." />
        )
      )}
      <Link href="/live-interviews" style={s.link}>
        Back to interview schedule →
      </Link>
    </LiveScreen>
  );
}
