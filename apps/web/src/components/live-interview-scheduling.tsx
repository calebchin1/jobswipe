'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  CancelInterviewSchema,
  CreateInterviewSlotSchema,
  InterviewSlotSchema,
  ScheduledInterviewSchema,
  type InterviewSlot,
  type LiveApplication,
  type ScheduledInterview,
} from '@swipe/contracts';
import { LiveApiError, liveApi } from '../lib/live-api';
import { interviewTimeLabel, localInterviewTime } from '../lib/local-interview-time';
import { LiveAudioInterview } from './live-audio-interview';

function field(value: unknown, name: string) {
  if (!value || typeof value !== 'object' || !(name in value))
    throw new Error('Missing response field');
  return (value as Record<string, unknown>)[name];
}
const parseSlots = (value: unknown) => InterviewSlotSchema.array().parse(field(value, 'slots'));
const parseInterviews = (value: unknown) =>
  ScheduledInterviewSchema.array().parse(field(value, 'interviews'));
const failureText = (error: unknown) =>
  error instanceof Error ? error.message : 'The scheduling request could not be completed.';

export function LiveInterviewScheduling({
  jobId,
  jobOpen,
  applications,
  onAuthFailure,
  onChanged,
}: {
  jobId: string;
  jobOpen: boolean;
  applications: LiveApplication[];
  onAuthFailure: (error: unknown) => void;
  onChanged: () => void;
}) {
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [interviews, setInterviews] = useState<ScheduledInterview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [timeZone, setTimeZone] = useState('');
  const [localStart, setLocalStart] = useState('');
  const [duration, setDuration] = useState('15');
  const [cancelling, setCancelling] = useState<ScheduledInterview | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [activeAudio, setActiveAudio] = useState<ScheduledInterview | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSlots([]);
    setInterviews([]);
    Promise.all([
      liveApi(`/jobs/${jobId}/interview-slots`, { signal: controller.signal, parse: parseSlots }),
      liveApi(`/jobs/${jobId}/interviews`, { signal: controller.signal, parse: parseInterviews }),
    ])
      .then(([nextSlots, nextInterviews]) => {
        if (controller.signal.aborted) return;
        setSlots(nextSlots);
        setInterviews(nextInterviews);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setError(failureText(error));
        if (error instanceof LiveApiError && [401, 403].includes(error.status))
          onAuthFailure(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [jobId, revision]);

  function fail(failure: unknown) {
    setError(failureText(failure));
    if (failure instanceof LiveApiError && [401, 403].includes(failure.status))
      onAuthFailure(failure);
  }
  async function createSlot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !jobOpen || !timeZone) return;
    setError('');
    setNotice('');
    let startsAt: Date;
    try {
      startsAt = localInterviewTime(localStart);
    } catch (failure) {
      setError(failureText(failure));
      return;
    }
    const input = CreateInterviewSlotSchema.safeParse({
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + Number(duration) * 60_000).toISOString(),
      timeZone,
    });
    if (!input.success) {
      setError(input.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy('create');
    try {
      await liveApi(`/jobs/${jobId}/interview-slots`, {
        method: 'POST',
        body: input.data,
        parse: (value) => InterviewSlotSchema.parse(field(value, 'slot')),
      });
      setLocalStart('');
      setNotice('Interview time added. Matched candidates can choose it when booking.');
      setRevision((value) => value + 1);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function cancelSlot(slot: InterviewSlot) {
    if (busy) return;
    setBusy(slot.id);
    setError('');
    setNotice('');
    try {
      await liveApi(`/interview-slots/${slot.id}/cancel`, {
        method: 'POST',
        body: {},
        parse: (value) => InterviewSlotSchema.parse(field(value, 'slot')),
      });
      setNotice('The unbooked slot has been removed from candidate availability.');
      setRevision((value) => value + 1);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function cancelInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !cancelling) return;
    const data = new FormData(event.currentTarget);
    const input = CancelInterviewSchema.safeParse({
      reason: String(data.get('reason') ?? '').trim(),
    });
    if (!input.success) {
      setError(input.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(cancelling.id);
    setError('');
    setNotice('');
    try {
      await liveApi(`/interviews/${cancelling.id}/cancel`, {
        method: 'POST',
        body: input.data,
        parse: (value) => ScheduledInterviewSchema.parse(field(value, 'interview')),
      });
      if (activeAudio?.id === cancelling.id) setActiveAudio(null);
      setCancelling(null);
      setNotice('The interview booking has been cancelled. The application remains active.');
      setRevision((value) => value + 1);
      onChanged();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }

  async function downloadCalendar(interview: ScheduledInterview) {
    if (busy) return;
    setBusy(`calendar-${interview.id}`);
    setError('');
    try {
      const response = await fetch(
        `/api/v1/applications/${interview.applicationId}/interviews/${interview.id}/calendar`,
        {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'text/calendar' },
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new LiveApiError(
          response.status,
          payload?.error?.code ?? 'CALENDAR_UNAVAILABLE',
          payload?.error?.message ??
            'The calendar file could not be downloaded. Refresh the schedule and try again.',
        );
      }
      if (!response.headers.get('content-type')?.includes('text/calendar'))
        throw new Error('The calendar response was unavailable. Please try again.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'interview.ics';
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }

  const now = clock;
  const futureSlots = slots
    .filter((slot) => slot.status === 'available' && Date.parse(slot.startsAt) > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const upcoming = interviews
    .filter(
      (interview) =>
        interview.status === 'scheduled' && Date.parse(interview.endsAt) + 15 * 60_000 > now,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const historical = interviews
    .filter(
      (interview) =>
        interview.status !== 'scheduled' || Date.parse(interview.endsAt) + 15 * 60_000 <= now,
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const bookedSlotCount = slots.filter((slot) => slot.status === 'booked').length;
  return (
    <section className="live-scheduling" aria-label="Interview scheduling">
      <div className="live-schedule-intro">
        <div>
          <h3>Make time for a first conversation.</h3>
          <p>
            Add specific dates for 15–60 minute interviews. Matched candidates can book an available
            time.
          </p>
        </div>
        <span className="tag">Round 1 · audio</span>
      </div>
      <p className="live-timezone">
        All times shown in <strong>{timeZone || 'your local timezone'}</strong>. Your calendar is
        not connected.
      </p>
      {notice && (
        <p className="live-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <div className="live-error" role="alert">
          <p>{error}</p>
          <button
            className="button secondary"
            disabled={!!busy}
            onClick={() => setRevision((value) => value + 1)}
          >
            Refresh schedule
          </button>
        </div>
      )}
      {jobOpen ? (
        <form className="live-slot-form" onSubmit={createSlot} aria-busy={busy === 'create'}>
          <label htmlFor={`slot-start-${jobId}`}>
            Interview date and start time
            <input
              id={`slot-start-${jobId}`}
              name="start"
              type="datetime-local"
              required
              value={localStart}
              onChange={(event) => setLocalStart(event.target.value)}
              disabled={!!busy || !timeZone}
            />
          </label>
          <label htmlFor={`slot-duration-${jobId}`}>
            Duration
            <select
              id={`slot-duration-${jobId}`}
              value={duration}
              onChange={(event) => setDuration(event.target.value)}
              disabled={!!busy}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="45">45 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>
          <button className="button primary" type="submit" disabled={!!busy || !timeZone}>
            {busy === 'create' ? 'Adding time…' : 'Add available time'}
          </button>
        </form>
      ) : (
        <p className="live-notice pending">
          New availability can be added after this job is published and open.
        </p>
      )}
      <p className="live-small-note">
        A slot belongs to the recruiter who creates it. The server checks overlapping bookings and
        availability; it does not read your external calendar.
      </p>
      {loading ? (
        <div className="live-empty" role="status" aria-busy="true">
          Loading your interview schedule…
        </div>
      ) : !error || slots.length || interviews.length ? (
        <>
          <div className="live-schedule-heading">
            <h3>
              Available times <span>{futureSlots.length}</span>
            </h3>
            <button
              onClick={() => setRevision((value) => value + 1)}
              className="live-text-button"
              disabled={!!busy}
            >
              Refresh
            </button>
          </div>
          {futureSlots.length ? (
            <ul className="live-slot-list">
              {futureSlots.map((slot) => {
                const label = interviewTimeLabel(
                  slot.startsAt,
                  slot.endsAt,
                  timeZone || slot.timeZone,
                );
                return (
                  <li key={slot.id}>
                    <div>
                      <strong>{label.date}</strong>
                      <span>{label.range}</span>
                      <small>{slot.ownedByMe ? 'Your availability' : 'Team availability'}</small>
                    </div>
                    {slot.ownedByMe && (
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => cancelSlot(slot)}
                        aria-label={`Remove slot ${label.date} ${label.range}`}
                      >
                        {busy === slot.id ? 'Removing…' : 'Remove slot'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="live-schedule-empty">
              <p>No open interview times yet.</p>
              <span>
                {bookedSlotCount
                  ? `${bookedSlotCount} slot${bookedSlotCount === 1 ? ' is' : 's are'} already booked. Add another time for future matches.`
                  : 'Add a time above when you’re ready to meet a candidate.'}
              </span>
            </div>
          )}
          <div className="live-schedule-heading">
            <h3>
              Upcoming interviews <span>{upcoming.length}</span>
            </h3>
          </div>
          {upcoming.length ? (
            <ul className="live-slot-list">
              {upcoming.map((interview) => {
                const label = interviewTimeLabel(
                  interview.startsAt,
                  interview.endsAt,
                  timeZone || interview.timeZone,
                );
                const application = applications.find(
                  (item) => item.id === interview.applicationId,
                );
                return (
                  <li className="live-booked-interview" key={interview.id}>
                    <div>
                      <span className="tag">Booked · audio round 1</span>
                      <strong>{application?.handle ?? 'Anonymous candidate'}</strong>
                      <span>
                        {label.date} · {label.range}
                      </span>
                    </div>
                    <div className="live-interview-actions">
                      {interview.isParticipant === true && (
                        <button
                          className="button primary"
                          disabled={
                            !!busy ||
                            now < Date.parse(interview.startsAt) - 10 * 60_000 ||
                            now >= Date.parse(interview.endsAt) + 15 * 60_000
                          }
                          onClick={() => setActiveAudio(interview)}
                        >
                          Open audio interview
                        </button>
                      )}
                      <a
                        className="button secondary"
                        href={`/api/v1/applications/${interview.applicationId}/interviews/${interview.id}/calendar`}
                        aria-disabled={!!busy}
                        onClick={(event) => {
                          event.preventDefault();
                          void downloadCalendar(interview);
                        }}
                      >
                        {busy === `calendar-${interview.id}` ? 'Downloading…' : 'Download calendar'}
                      </a>
                      <button
                        className="button secondary"
                        disabled={!!busy}
                        onClick={() => {
                          setCancelling(interview);
                          setError('');
                        }}
                      >
                        Cancel interview
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="live-schedule-empty">
              <p>No upcoming interviews.</p>
              <span>
                A booking appears here after a matched candidate selects one of your available
                slots.
              </span>
            </div>
          )}
          {activeAudio && (
            <LiveAudioInterview
              key={activeAudio.id}
              interviewId={activeAudio.id}
              candidateHandle={
                applications.find((application) => application.id === activeAudio.applicationId)
                  ?.handle ?? 'Anonymous candidate'
              }
              closesAt={new Date(Date.parse(activeAudio.endsAt) + 15 * 60_000).toISOString()}
              onClose={() => setActiveAudio(null)}
              onAuthFailure={onAuthFailure}
            />
          )}
          {upcoming.length > 0 && (
            <p className="live-small-note">
              Calendar downloads are static copies. They do not update automatically when a booking
              changes or is cancelled; check this workspace for the current schedule.
            </p>
          )}
          {cancelling && (
            <form
              className="live-cancel-interview"
              onSubmit={cancelInterview}
              aria-label="Confirm interview cancellation"
            >
              <h3>Cancel this interview?</h3>
              <p>
                The candidate will no longer have a scheduled interview at this time. Their
                application stays active. No email or calendar update is sent from this workspace
                yet.
              </p>
              <label htmlFor="cancellation-reason">
                Reason · optional
                <textarea
                  id="cancellation-reason"
                  name="reason"
                  rows={2}
                  maxLength={500}
                  disabled={!!busy}
                />
              </label>
              <div>
                <button
                  type="button"
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => setCancelling(null)}
                >
                  Keep interview
                </button>
                <button type="submit" className="button primary" disabled={!!busy}>
                  {busy ? 'Cancelling…' : 'Confirm cancellation'}
                </button>
              </div>
            </form>
          )}
          {historical.length > 0 && (
            <div className="live-schedule-history">
              <button
                className="live-text-button"
                aria-expanded={showPast}
                onClick={() => setShowPast((value) => !value)}
              >
                {showPast ? 'Hide' : 'Show'} past and cancelled interviews ({historical.length})
              </button>
              {showPast && (
                <ul className="live-slot-list">
                  {historical.map((interview) => {
                    const label = interviewTimeLabel(
                      interview.startsAt,
                      interview.endsAt,
                      timeZone || interview.timeZone,
                    );
                    return (
                      <li key={interview.id}>
                        <div>
                          <strong>{label.date}</strong>
                          <span>{label.range}</span>
                        </div>
                        <span className="tag">
                          {interview.status === 'scheduled'
                            ? 'Past · completion not recorded'
                            : interview.status.replaceAll('_', ' ')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      ) : null}
      <div className="live-call-unavailable">
        <strong>A private first conversation.</strong>
        <p>
          The assigned interviewer can open audio from 10 minutes before the interview until 15
          minutes after its end. Audio requires a configured calling service. A connection is not
          proof of completion; scorecard and identity reveal actions remain unavailable here.
        </p>
      </div>
    </section>
  );
}
