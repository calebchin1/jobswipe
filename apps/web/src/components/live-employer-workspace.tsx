'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  AccountContextSchema,
  EmployerInputSchema,
  LiveApplicationSchema,
  LiveCandidateCardSchema,
  LiveJobDraftSchema,
  LiveJobSchema,
  UuidSchema,
  type AccountContext,
  type EmployerContext,
  type LiveApplication,
  type LiveCandidateCard,
  type LiveJob,
  type LiveJobDraft,
} from '@swipe/contracts';
import { LiveApiError, liveApi } from '../lib/live-api';
import { LiveInterviewScheduling } from './live-interview-scheduling';
import { DeckStack, MatchOverlay, RoundButtons, type DeckCardContent } from './deck';

type WorkspaceTab = 'candidates' | 'applications' | 'schedule' | 'details';
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || !(key in value))
    throw new Error('Missing response field');
  return (value as Record<string, unknown>)[key];
}
const parseAccount = (value: unknown) => AccountContextSchema.parse(field(value, 'account'));
const parseJobs = (value: unknown) => LiveJobSchema.array().parse(field(value, 'jobs'));
const parseCandidates = (value: unknown) =>
  LiveCandidateCardSchema.array().parse(field(value, 'candidates'));
const parseApplications = (value: unknown) =>
  LiveApplicationSchema.array().parse(field(value, 'applications'));
const money = (minor: number) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
const draftFieldLabels: Record<string, string> = {
  title: 'Job title',
  description: 'About the role',
  payMinMinor: 'Minimum pay',
  payMaxMinor: 'Maximum pay',
  payPeriod: 'Pay period',
  location: 'Location',
  hoursPerWeek: 'Hours per week',
  schedule: 'Working days',
  skills: 'Skills',
  mustHaves: 'Must-haves',
  niceToHaves: 'Nice-to-haves',
  questions: 'Interview questions',
  workplaceType: 'Workplace type',
  jobType: 'Job type',
};
const errorMessage = (failure: unknown) =>
  failure instanceof Error ? failure.message : 'This action could not be completed. Try again.';
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function LiveEmployerWorkspace() {
  const [account, setAccount] = useState<AccountContext | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [accountError, setAccountError] = useState<LiveApiError | Error | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [employerId, setEmployerId] = useState('');
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [candidates, setCandidates] = useState<LiveCandidateCard[]>([]);
  const [applications, setApplications] = useState<LiveApplication[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [activityRevision, setActivityRevision] = useState(0);
  const [passed, setPassed] = useState<LiveCandidateCard[]>([]);
  const [matchWith, setMatchWith] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>('candidates');
  const [editing, setEditing] = useState<'new' | LiveJob | null>(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const employer = account?.employers.find((item) => item.id === employerId);
  const selectedJob = jobs.find((job) => job.id === selectedJobId);
  const canRecruit = employer?.verificationStatus === 'verified' && employer.role !== 'viewer';

  function fail(failure: unknown) {
    if (
      failure instanceof LiveApiError &&
      (failure.status === 401 || failure.status === 403 || failure.code === 'ACCOUNT_INACTIVE')
    ) {
      setAccount(null);
      setJobs([]);
      setCandidates([]);
      setApplications([]);
      setEditing(null);
      setAccountError(failure);
      setAccountLoading(false);
    } else setActionError(errorMessage(failure));
  }
  useEffect(() => {
    const controller = new AbortController();
    setAccountLoading(true);
    setAccountError(null);
    liveApi('/me', { signal: controller.signal, parse: parseAccount })
      .then((next) => {
        if (controller.signal.aborted) return;
        setJobs([]);
        setCandidates([]);
        setApplications([]);
        setAccount(next);
        setEmployerId((previous) =>
          next.employers.some((e) => e.id === previous) ? previous : (next.employers[0]?.id ?? ''),
        );
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setAccount(null);
        setJobs([]);
        setCandidates([]);
        setApplications([]);
        setAccountError(
          failure instanceof Error ? failure : new Error('Unable to load your account.'),
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setAccountLoading(false);
      });
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setJobs([]);
    setJobsError('');
    setCandidates([]);
    setApplications([]);
    setEditing(null);
    setPassed([]);
    if (!employer || employer.verificationStatus === 'suspended' || account?.status !== 'active') {
      setJobsLoading(false);
      return;
    }
    setJobsLoading(true);
    liveApi(`/employers/${employer.id}/jobs`, { signal: controller.signal, parse: parseJobs })
      .then((next) => {
        if (controller.signal.aborted) return;
        setJobs(next);
        setSelectedJobId((previous) =>
          next.some((job) => job.id === previous) ? previous : (next[0]?.id ?? ''),
        );
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setJobsError(errorMessage(failure));
          fail(failure);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setJobsLoading(false);
      });
    return () => controller.abort();
    // Scope job state to the authenticated account and selected organization.
  }, [employerId, account, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setCandidates([]);
    setApplications([]);
    setActivityError('');
    setPassed([]);
    if (!selectedJob || !canRecruit) {
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    Promise.all([
      selectedJob.status === 'open'
        ? liveApi(`/jobs/${selectedJob.id}/candidates`, {
            signal: controller.signal,
            parse: parseCandidates,
          })
        : Promise.resolve([] as LiveCandidateCard[]),
      liveApi(`/jobs/${selectedJob.id}/applications`, {
        signal: controller.signal,
        parse: parseApplications,
      }),
    ])
      .then(([nextCandidates, nextApplications]) => {
        if (controller.signal.aborted) return;
        setCandidates(nextCandidates);
        setApplications(nextApplications);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setActivityError(errorMessage(failure));
          fail(failure);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setActivityLoading(false);
      });
    return () => controller.abort();
  }, [selectedJob, canRecruit, activityRevision]);

  async function signOut() {
    setBusy('sign-out');
    setActionError('');
    try {
      await liveApi('/auth/sign-out', { method: 'POST', body: {}, parse: () => null });
      setAccount(null);
      setJobs([]);
      setCandidates([]);
      setApplications([]);
      window.location.assign('/sign-in');
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function publish() {
    if (!selectedJob || !canRecruit || busy) return;
    setBusy('publish');
    setActionError('');
    try {
      await liveApi(`/jobs/${selectedJob.id}/publish`, {
        method: 'POST',
        body: {},
        parse: (value) => UuidSchema.parse(field(value, 'versionId')),
      });
      const next = await liveApi(`/employers/${employerId}/jobs`, { parse: parseJobs });
      setJobs(next);
      setNotice('Your job has been published. Candidates can now discover the current posting.');
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function interest(card: LiveCandidateCard) {
    if (!selectedJob || !canRecruit || busy) return;
    setBusy(card.cardRef);
    setActionError('');
    try {
      const applicationId = await liveApi(`/jobs/${selectedJob.id}/interest`, {
        method: 'POST',
        body: { cardId: card.cardRef },
        parse: (value) => UuidSchema.nullable().parse(field(value, 'applicationId')),
      });
      setCandidates((previous) => previous.filter((item) => item.cardRef !== card.cardRef));
      const nextApplications = await liveApi(`/jobs/${selectedJob.id}/applications`, {
        parse: parseApplications,
      });
      setApplications(nextApplications);
      const matched =
        nextApplications.find((application) => application.id === applicationId)?.stage ===
        'Matched';
      if (matched) setMatchWith(card.handle);
      setNotice(
        matched
          ? `You matched with ${card.handle}. They’re now in your application pipeline.`
          : `Your interest in ${card.handle} is saved. A match requires interest from both sides.`,
      );
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function pass(card: LiveCandidateCard) {
    if (!selectedJob || !canRecruit || busy) return;
    setBusy(card.cardRef);
    setActionError('');
    try {
      await liveApi(`/jobs/${selectedJob.id}/candidates/${card.cardRef}/pass`, {
        method: 'POST',
        body: {},
        parse: () => null,
      });
      setCandidates((previous) => previous.filter((item) => item.cardRef !== card.cardRef));
      setPassed((previous) => [card, ...previous]);
      setNotice(`You passed on ${card.handle}. They aren’t notified.`);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function undoPass() {
    const [card, ...rest] = passed;
    if (!card || !selectedJob || !canRecruit || busy) return;
    setBusy('undo');
    setActionError('');
    try {
      await liveApi(`/jobs/${selectedJob.id}/candidates/${card.cardRef}/pass/undo`, {
        method: 'POST',
        body: {},
        parse: () => null,
      });
      setPassed(rest);
      setCandidates((previous) => [card, ...previous]);
      setNotice(`${card.handle} is back in your deck.`);
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }
  async function saveJob(draft: LiveJobDraft, jobId?: string) {
    if (!employer || busy) return;
    setBusy('save-job');
    setActionError('');
    try {
      const savedId = await liveApi(`/employers/${employer.id}/jobs`, {
        method: 'POST',
        body: { draft, ...(jobId ? { jobId } : {}) },
        parse: (value) => UuidSchema.parse(field(value, 'jobId')),
      });
      const next = await liveApi(`/employers/${employer.id}/jobs`, { parse: parseJobs });
      setJobs(next);
      setSelectedJobId(savedId);
      setEditing(null);
      setTab('details');
      setNotice('Your draft is saved. Review the details before publishing.');
    } catch (failure) {
      fail(failure);
    } finally {
      setBusy('');
    }
  }

  const header = (
    <>
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <header className="live-header">
        <Link href="/workspace" className="brand" aria-label="First workspace">
          <span className="brand-mark">
            f<span>↗</span>
          </span>
          first<span className="brand-period">.</span>
        </Link>
        <div className="live-header-right">
          <Link href="/">Synthetic demo</Link>
          <span className="live-badge">Employer workspace</span>
          {account && (
            <button className="button secondary" onClick={signOut} disabled={!!busy}>
              {busy === 'sign-out' ? 'Signing out…' : 'Sign out'}
            </button>
          )}
        </div>
      </header>
    </>
  );
  if (accountLoading)
    return (
      <div className="live-shell">
        {header}
        <main id="main" className="live-status-panel" aria-busy="true" role="status">
          <span className="live-symbol" aria-hidden="true">
            ✳
          </span>
          <h1>Opening your workspace.</h1>
          <p>Checking your account and team access…</p>
        </main>
      </div>
    );
  if (accountError) {
    const expired = accountError instanceof LiveApiError && accountError.status === 401;
    return (
      <div className="live-shell">
        {header}
        <main id="main" className="live-status-panel">
          <h1>{expired ? 'Sign in to your workspace.' : 'Your workspace is unavailable.'}</h1>
          <p role="alert">{accountError.message}</p>
          <div className="live-failure-actions">
            {expired ? (
              <Link href="/sign-in" className="button primary">
                Sign in
              </Link>
            ) : (
              <button className="button primary" onClick={() => setRefresh((r) => r + 1)}>
                Try again
              </button>
            )}
            <Link href="/" className="button secondary">
              Explore the demo
            </Link>
          </div>
        </main>
      </div>
    );
  }
  if (!account || account.status !== 'active')
    return (
      <div className="live-shell">
        {header}
        <main id="main" className="live-status-panel">
          <h1>This account is inactive.</h1>
          <p>
            Workspace access is unavailable while your account is {account?.status ?? 'unavailable'}
            . Contact the team responsible for your account before continuing.
          </p>
          {actionError && (
            <p className="live-error" role="alert">
              {actionError}
            </p>
          )}
        </main>
      </div>
    );
  if (!account.roles.includes('employer'))
    return (
      <div className="live-shell">
        {header}
        <main id="main" className="live-status-panel">
          <h1>This is an employer workspace.</h1>
          <p>
            Your account doesn’t have an employer role. Continue in the candidate app, or sign out
            and use your employer account.
          </p>
          {actionError && (
            <p className="live-error" role="alert">
              {actionError}
            </p>
          )}
        </main>
      </div>
    );
  return (
    <div className="live-shell">
      {header}
      <MatchOverlay
        open={!!matchWith}
        body={`You and ${matchWith} are both interested. Offer interview times so they can book a short audio conversation. Their identity stays protected.`}
        primary={{
          label: 'Offer interview times',
          onClick: () => {
            setMatchWith('');
            setTab('schedule');
          },
        }}
        onClose={() => setMatchWith('')}
      />
      <main className="live-workspace-main" id="main">
        <div className="live-page-heading">
          <div>
            <div className="eyebrow">GOOD PEOPLE. GREAT POSSIBILITIES.</div>
            <h1>
              {account.employers.length
                ? (employer?.name ?? 'Your hiring workspace.')
                : 'Let’s meet your company.'}
            </h1>
            <p>
              {account.employers.length
                ? 'Thoughtful hiring starts with a clear role and an open mind.'
                : 'Tell us who you are and where candidates can learn about you.'}
            </p>
          </div>
          {employer &&
            employer.role !== 'viewer' &&
            employer.verificationStatus !== 'suspended' && (
              <button
                className="button primary"
                onClick={() => {
                  setEditing('new');
                  setActionError('');
                  setNotice('');
                }}
                disabled={!!busy}
              >
                ＋ Create job
              </button>
            )}
        </div>
        {account.employers.length > 1 && (
          <label className="live-organization-select">
            Company
            <select
              value={employerId}
              disabled={!!busy}
              onChange={(event) => {
                setJobs([]);
                setCandidates([]);
                setApplications([]);
                setEditing(null);
                setEmployerId(event.target.value);
                setSelectedJobId('');
                setNotice('');
                setActionError('');
              }}
            >
              {account.employers.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {notice && (
          <div className="live-notice" role="status">
            <span>{notice}</span>
            <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
              ×
            </button>
          </div>
        )}
        {actionError && (
          <div className="live-error" role="alert">
            {actionError}
          </div>
        )}
        {!account.employers.length ? (
          <CompanySetup
            onCreated={() => {
              setNotice(
                'Your company has been submitted for verification. You can start drafting a job.',
              );
              setRefresh((r) => r + 1);
            }}
            onAuthFailure={fail}
          />
        ) : employer?.verificationStatus === 'suspended' ? (
          <section className="live-status-panel">
            <h2>Company access is suspended.</h2>
            <p>
              Job management and candidate access are unavailable for this company. Your account may
              still have access to another company.
            </p>
          </section>
        ) : employer ? (
          <>
            {employer.verificationStatus === 'pending' && (
              <div className="live-notice pending">
                <span>
                  <strong>Company verification is pending.</strong> You can prepare drafts while
                  your company is reviewed. Publishing and candidate browsing unlock after
                  verification.
                </span>
                <button onClick={() => setRefresh((r) => r + 1)} disabled={!!busy}>
                  Refresh status
                </button>
              </div>
            )}
            {employer.role === 'viewer' && (
              <div className="live-notice">
                <span>
                  Your team seat has view-only access. An owner or recruiter manages postings and
                  candidate interest.
                </span>
              </div>
            )}
            {editing ? (
              <JobEditor
                key={editing === 'new' ? 'new' : editing.id}
                initial={editing === 'new' ? undefined : editing}
                busy={!!busy}
                onCancel={() => {
                  setEditing(null);
                  setActionError('');
                }}
                onSave={saveJob}
              />
            ) : jobsLoading ? (
              <section className="live-section-panel live-empty" role="status" aria-busy="true">
                <h2>Loading your jobs…</h2>
              </section>
            ) : jobsError ? (
              <section className="live-section-panel live-empty">
                <p role="alert">{jobsError}</p>
                <button className="button secondary" onClick={() => setRefresh((r) => r + 1)}>
                  Retry
                </button>
              </section>
            ) : !jobs.length ? (
              <section className="live-section-panel live-empty">
                <span className="live-symbol" aria-hidden="true">
                  ✳
                </span>
                <h3>Your next teammate starts here.</h3>
                <p>
                  Create a role with clear pay, expectations, and questions for a structured first
                  interview.
                </p>
                {employer.role !== 'viewer' && (
                  <button className="button primary" onClick={() => setEditing('new')}>
                    Create your first job
                  </button>
                )}
              </section>
            ) : (
              <div className="live-content-grid">
                <aside className="live-job-list" aria-label="Your jobs">
                  {jobs.map((job) => (
                    <button
                      className={`live-job-button ${job.id === selectedJobId ? 'selected' : ''}`}
                      key={job.id}
                      aria-pressed={job.id === selectedJobId}
                      disabled={!!busy}
                      onClick={() => {
                        setCandidates([]);
                        setApplications([]);
                        setActivityError('');
                        setSelectedJobId(job.id);
                        setNotice('');
                        setActionError('');
                      }}
                    >
                      <span className="tag">
                        {job.status === 'open' ? 'Published' : job.status}
                      </span>
                      <strong>{job.details?.title ?? 'Untitled draft'}</strong>
                      <small>{job.details?.location ?? 'Location not set'}</small>
                      {job.details && (
                        <span>
                          {money(job.details.payMinMinor)}–{money(job.details.payMaxMinor)} /{' '}
                          {job.details.payPeriod}
                        </span>
                      )}
                      {job.hasUnpublishedChanges && <small>Unpublished changes</small>}
                    </button>
                  ))}
                </aside>
                {selectedJob && (
                  <section className="live-section-panel">
                    <div className="live-panel-heading">
                      <div>
                        <h2>{selectedJob.details?.title ?? 'Untitled draft'}</h2>
                        <p>
                          {selectedJob.details?.location}{' '}
                          {selectedJob.details &&
                            `· ${selectedJob.details.hoursPerWeek} hours / week`}
                        </p>
                      </div>
                      {employer.role !== 'viewer' && (
                        <button
                          className="button secondary"
                          onClick={() => {
                            setEditing(selectedJob);
                            setActionError('');
                          }}
                          disabled={!!busy}
                        >
                          Edit draft
                        </button>
                      )}
                    </div>
                    <div className="live-tabs" role="tablist" aria-label="Job workspace">
                      {(
                        ['candidates', 'applications', 'schedule', 'details'] as WorkspaceTab[]
                      ).map((section) => (
                        <button
                          role="tab"
                          id={`tab-${section}`}
                          aria-selected={tab === section}
                          aria-controls={`panel-${section}`}
                          key={section}
                          tabIndex={tab === section ? 0 : -1}
                          onKeyDown={(event) => {
                            const order: WorkspaceTab[] = [
                              'candidates',
                              'applications',
                              'schedule',
                              'details',
                            ];
                            const direction =
                              event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                            if (!direction && event.key !== 'Home' && event.key !== 'End') return;
                            event.preventDefault();
                            const next =
                              event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? order.length - 1
                                  : (order.indexOf(tab) + direction + order.length) % order.length;
                            setTab(order[next]);
                            document.getElementById(`tab-${order[next]}`)?.focus();
                          }}
                          onClick={() => setTab(section)}
                        >
                          {section === 'candidates'
                            ? 'Candidate shortlist'
                            : section === 'applications'
                              ? 'Applications'
                              : section === 'schedule'
                                ? 'Interviews'
                                : 'Job details'}
                        </button>
                      ))}
                    </div>
                    <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                      {tab === 'details' ? (
                        <JobDetails
                          job={selectedJob}
                          employer={employer}
                          busy={!!busy}
                          onPublish={publish}
                        />
                      ) : !canRecruit ? (
                        <div className="live-empty">
                          <h3>
                            {employer.role === 'viewer'
                              ? 'Recruiter access required.'
                              : 'Your shortlist comes after verification.'}
                          </h3>
                          <p>
                            {employer.role === 'viewer'
                              ? 'An owner or recruiter can review candidates and manage applications.'
                              : 'Your company must be verified before candidates or applications can be reviewed.'}
                          </p>
                        </div>
                      ) : tab === 'schedule' ? (
                        <LiveInterviewScheduling
                          key={selectedJob.id}
                          jobId={selectedJob.id}
                          jobOpen={selectedJob.status === 'open'}
                          applications={applications}
                          onAuthFailure={fail}
                          onChanged={() => setActivityRevision((value) => value + 1)}
                        />
                      ) : tab === 'candidates' && selectedJob.status !== 'open' ? (
                        <div className="live-empty">
                          <h3>
                            {selectedJob.status === 'draft'
                              ? 'Publish your role to meet candidates.'
                              : 'This role isn’t accepting interest.'}
                          </h3>
                          <p>
                            {selectedJob.status === 'draft'
                              ? 'Review the job details, then publish when you’re ready.'
                              : 'Candidate discovery is available for open roles.'}
                          </p>
                          <button className="button secondary" onClick={() => setTab('details')}>
                            Review job details
                          </button>
                        </div>
                      ) : activityLoading ? (
                        <div className="live-empty" role="status" aria-busy="true">
                          Loading {tab === 'candidates' ? 'your shortlist' : 'applications'}…
                        </div>
                      ) : activityError ? (
                        <div className="live-empty">
                          <p role="alert">{activityError}</p>
                          <button
                            className="button secondary"
                            onClick={() => setActivityRevision((r) => r + 1)}
                          >
                            Try again
                          </button>
                        </div>
                      ) : tab === 'candidates' ? (
                        <>
                          {!candidates.length ? (
                            <div className="live-empty">
                              <span className="live-symbol" aria-hidden="true">
                                ✳
                              </span>
                              <h3>
                                {passed.length || applications.length
                                  ? 'You’re all caught up.'
                                  : 'Your shortlist is taking shape.'}
                              </h3>
                              <p>
                                {passed.length || applications.length
                                  ? 'You’ve reviewed every available candidate for this role. Matches are in Applications.'
                                  : 'No approved, eligible candidate profiles are available for this role yet. Check back as candidates join.'}
                              </p>
                              <div className="live-failure-actions">
                                <button
                                  className="button secondary"
                                  onClick={() => setActivityRevision((r) => r + 1)}
                                >
                                  Refresh shortlist
                                </button>
                                {!!passed.length && (
                                  <button
                                    className="button secondary"
                                    disabled={!!busy}
                                    onClick={undoPass}
                                  >
                                    Undo last pass
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="live-deck">
                              <p className="swipe-progress" aria-live="polite">
                                {candidates.length}{' '}
                                {candidates.length === 1 ? 'candidate' : 'candidates'} left
                              </p>
                              <DeckStack
                                cards={candidates.slice(0, 2).map(toDeckCard)}
                                disabled={!!busy}
                                onSwipe={(_, direction) =>
                                  direction === 'right'
                                    ? interest(candidates[0])
                                    : pass(candidates[0])
                                }
                              />
                              <RoundButtons
                                actions={[
                                  {
                                    label: 'Undo last pass',
                                    glyph: '↶',
                                    tone: 'undo',
                                    disabled: !!busy || !passed.length,
                                    onClick: undoPass,
                                  },
                                  {
                                    label: 'Pass',
                                    glyph: '✕',
                                    tone: 'pass',
                                    big: true,
                                    disabled: !!busy,
                                    onClick: () => pass(candidates[0]),
                                  },
                                  {
                                    label: 'I’m interested',
                                    glyph: '✓',
                                    tone: 'like',
                                    big: true,
                                    disabled: !!busy,
                                    onClick: () => interest(candidates[0]),
                                  },
                                ]}
                              />
                            </div>
                          )}
                          <p className="live-small-note">
                            These are approved anonymous profiles from your authenticated workspace.
                            Name, contact details, age, school, and private documents aren’t
                            included.
                          </p>
                        </>
                      ) : (
                        <ApplicationList applications={applications} />
                      )}
                    </div>
                  </section>
                )}
              </div>
            )}
          </>
        ) : (
          <section className="live-status-panel">
            <p>
              No accessible company was found. Refresh your account to check your current team
              memberships.
            </p>
            <button className="button secondary" onClick={() => setRefresh((r) => r + 1)}>
              Refresh account
            </button>
          </section>
        )}
        <footer className="page-footer">
          <span>
            first. <span>More potential. Less bias.</span>
          </span>
          <span>Skills first. People always.</span>
        </footer>
      </main>
    </div>
  );
}

function CompanySetup({
  onCreated,
  onAuthFailure,
}: {
  onCreated: () => void;
  onAuthFailure: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const input = EmployerInputSchema.safeParse({
      name: String(data.get('name') ?? ''),
      website: String(data.get('website') ?? ''),
    });
    if (!input.success) {
      setError(input.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      await liveApi('/employers', {
        method: 'POST',
        body: input.data,
        parse: (value) => UuidSchema.parse(field(value, 'employerId')),
      });
      onCreated();
    } catch (failure) {
      setError(errorMessage(failure));
      if (failure instanceof LiveApiError && (failure.status === 401 || failure.status === 403))
        onAuthFailure(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="live-setup-grid">
      <section className="live-section-panel">
        <h2>Your company</h2>
        <p className="subtle">
          Use the business name and public website candidates will recognize.
        </p>
        <form className="live-form" onSubmit={submit} aria-busy={busy}>
          <label htmlFor="company-name">
            Company name
            <input
              id="company-name"
              name="name"
              autoComplete="organization"
              required
              minLength={2}
              maxLength={100}
              disabled={busy}
            />
          </label>
          <label htmlFor="company-website">
            Company website
            <input
              id="company-website"
              name="website"
              type="url"
              autoComplete="url"
              placeholder="https://yourcompany.ca"
              required
              maxLength={500}
              disabled={busy}
            />
            <small>
              Include https://. A matching domain alone does not verify your authority to hire.
            </small>
          </label>
          {error && (
            <p className="live-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Creating your company…' : 'Create company & request review'}
          </button>
        </form>
      </section>
      <aside className="live-setup-aside">
        <span className="eyebrow">TRUST STARTS HERE</span>
        <h2>
          A real company.
          <br />A fair first step.
        </h2>
        <ol>
          <li>Submit your company details.</li>
          <li>Prepare your first job while verification is pending.</li>
          <li>Once verified, publish roles and review anonymous candidates.</li>
        </ol>
        <p>Candidate access stays closed until the company has been reviewed.</p>
      </aside>
    </div>
  );
}

function ApplicationList({ applications }: { applications: LiveApplication[] }) {
  if (!applications.length)
    return (
      <div className="live-empty">
        <h3>Your first application is ahead.</h3>
        <p>
          Candidate applications appear here. A mutual match happens only after both sides express
          interest.
        </p>
      </div>
    );
  return (
    <>
      <div className="live-table-wrap">
        <table className="live-table">
          <thead>
            <tr>
              <th scope="col">Candidate</th>
              <th scope="col">Stage</th>
              <th scope="col">Applied</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id}>
                <td>
                  <strong>
                    {application.stage === 'Withdrawn'
                      ? 'Withdrawn candidate'
                      : (application.handle ?? 'Anonymous candidate')}
                  </strong>
                  {application.stage !== 'Withdrawn' && application.headline && (
                    <small>{application.headline}</small>
                  )}
                </td>
                <td>
                  <span className="tag">{application.stage}</span>
                  <small>
                    {application.stage === 'Applied'
                      ? 'Waiting for employer interest'
                      : application.stage === 'Matched'
                        ? 'Both sides are interested'
                        : application.stage === 'Withdrawn'
                          ? 'Candidate has left this process'
                          : 'Recorded application status'}
                  </small>
                </td>
                <td>{dateLabel(application.appliedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="live-small-note">
        Audio calls and identity sharing aren’t available in this workspace yet. A match does not
        unlock identity.
      </p>
    </>
  );
}

function JobDetails({
  job,
  employer,
  busy,
  onPublish,
}: {
  job: LiveJob;
  employer: EmployerContext;
  busy: boolean;
  onPublish: () => void;
}) {
  const details = job.details;
  if (!details)
    return (
      <div className="live-empty">
        <h3>This draft needs some details.</h3>
        <p>Edit the draft to add the role, compensation, and interview questions.</p>
      </div>
    );
  return (
    <>
      <div className="live-job-summary">
        <strong>
          {money(details.payMinMinor)}–{money(details.payMaxMinor)} CAD / {details.payPeriod}
        </strong>
        <br />
        {details.jobType} · {details.hoursPerWeek} hours / week · {details.location}
        <br />
        {details.schedule.join(', ')}
      </div>
      <h3>About the role</h3>
      <p className="subtle live-preserve-lines">{details.description}</p>
      <h3>Must-have skills</h3>
      <ul className="impact-list">
        {details.mustHaves.map((requirement, index) => (
          <li key={index}>
            <span className="bullet-star" aria-hidden="true">
              ✦
            </span>
            {requirement}
          </li>
        ))}
      </ul>
      {details.niceToHaves.length > 0 && (
        <>
          <h3>Nice to have</h3>
          <ul className="impact-list">
            {details.niceToHaves.map((requirement, index) => (
              <li key={index}>{requirement}</li>
            ))}
          </ul>
        </>
      )}
      <div className="skill-tags">
        {details.skills.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      <h3>Structured interview questions</h3>
      <ol className="live-question-list">
        {details.questions.map((question, index) => (
          <li key={index}>{question}</li>
        ))}
      </ol>
      <div className="skill-tags">
        <span>{details.isVacancy ? 'Existing vacancy' : 'Future opportunity'}</span>
        <span>
          {details.usesAiScreening
            ? 'AI used to screen, assess, or select applicants'
            : 'No AI screening declared'}
        </span>
        <span>Workplace: {details.workplaceType.replaceAll('_', ' ')}</span>
      </div>
      {job.hasUnpublishedChanges && (
        <p className="live-notice pending">
          This role has unpublished changes. Candidates continue to see the last published version
          until you publish the draft.
        </p>
      )}
      {employer.role !== 'viewer' && (job.status === 'draft' || job.hasUnpublishedChanges) && (
        <>
          <button
            className="button primary"
            onClick={onPublish}
            disabled={busy || employer.verificationStatus !== 'verified'}
          >
            {busy
              ? 'Please wait…'
              : job.status === 'draft'
                ? 'Publish job'
                : 'Publish updated version'}
          </button>
          {employer.verificationStatus !== 'verified' && (
            <p className="live-small-note">Publishing unlocks after company verification.</p>
          )}
        </>
      )}
      <p className="live-small-note">
        Review every field before publishing. Form validation supports clear postings; it does not
        certify legal compliance.
      </p>
    </>
  );
}

function JobEditor({
  initial,
  busy,
  onCancel,
  onSave,
}: {
  initial?: LiveJob;
  busy: boolean;
  onCancel: () => void;
  onSave: (draft: LiveJobDraft, jobId?: string) => Promise<void>;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const defaults = initial?.details;
  const [period, setPeriod] = useState<'hour' | 'year'>(defaults?.payPeriod ?? 'hour');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? '').trim();
    const lines = (key: string) =>
      text(key)
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);
    const draft = LiveJobDraftSchema.safeParse({
      title: text('title'),
      description: text('description'),
      payMinMinor: Math.round(Number(text('payMin')) * 100),
      payMaxMinor: Math.round(Number(text('payMax')) * 100),
      payPeriod: period,
      currency: 'CAD',
      location: text('location'),
      hoursPerWeek: Number(text('hours')),
      schedule: data.getAll('schedule'),
      skills: text('skills')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      mustHaves: lines('mustHaves'),
      niceToHaves: lines('niceToHaves'),
      questions: lines('questions'),
      isVacancy: text('vacancy') === 'yes',
      usesAiScreening: text('ai') === 'yes',
      workplaceType: text('workplaceType'),
      jobType: text('jobType'),
    });
    if (!draft.success) {
      setErrors(
        draft.error.issues.map(
          (issue) => `${draftFieldLabels[String(issue.path[0])] ?? 'Job'}: ${issue.message}`,
        ),
      );
      return;
    }
    setErrors([]);
    await onSave(draft.data, initial?.id);
  }
  return (
    <section className="live-section-panel">
      <div className="live-panel-heading">
        <div>
          <span className="eyebrow">CLEAR EXPECTATIONS. BETTER CONNECTIONS.</span>
          <h2>{initial ? 'Edit your job draft' : 'Create a new job'}</h2>
          <p>Save your draft first, then review it before publishing.</p>
        </div>
      </div>
      <form className="live-form" onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="live-editor-fieldset">
          <legend className="live-sr-only">Job details</legend>
          <div className="live-form-grid">
            <label className="full" htmlFor="job-title">
              Job title
              <input
                id="job-title"
                name="title"
                required
                minLength={3}
                maxLength={100}
                defaultValue={defaults?.title}
              />
            </label>
            <label htmlFor="job-type">
              Job type
              <select id="job-type" name="jobType" defaultValue={defaults?.jobType ?? 'Part-time'}>
                <option>Part-time</option>
                <option>Summer</option>
                <option>Internship</option>
                <option>Full-time</option>
              </select>
            </label>
            <label htmlFor="job-location">
              Location
              <input
                id="job-location"
                name="location"
                required
                minLength={2}
                maxLength={100}
                defaultValue={defaults?.location}
                placeholder="Waterloo, Ontario"
              />
            </label>
            <label className="full" htmlFor="job-description">
              About the role
              <textarea
                id="job-description"
                name="description"
                rows={5}
                required
                minLength={20}
                maxLength={5000}
                defaultValue={defaults?.description}
              />
            </label>
            <label htmlFor="job-period">
              Pay period
              <select
                id="job-period"
                value={period}
                onChange={(event) => setPeriod(event.target.value as 'hour' | 'year')}
              >
                <option value="hour">Hourly · CAD</option>
                <option value="year">Annually · CAD</option>
              </select>
            </label>
            <label htmlFor="job-hours">
              Hours per week
              <input
                id="job-hours"
                name="hours"
                type="number"
                required
                min={1}
                max={60}
                step={1}
                defaultValue={defaults?.hoursPerWeek}
              />
            </label>
            <label htmlFor="job-pay-min">
              Minimum pay · CAD / {period}
              <input
                id="job-pay-min"
                name="payMin"
                type="number"
                required
                min="0.01"
                step="0.01"
                defaultValue={defaults ? defaults.payMinMinor / 100 : undefined}
              />
            </label>
            <label htmlFor="job-pay-max">
              Maximum pay · CAD / {period}
              <input
                id="job-pay-max"
                name="payMax"
                type="number"
                required
                min="0.01"
                step="0.01"
                defaultValue={defaults ? defaults.payMaxMinor / 100 : undefined}
              />
            </label>
            <fieldset className="full">
              <legend>Working days · select at least one</legend>
              <div className="live-choice-row">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                  <label key={day}>
                    <input
                      type="checkbox"
                      name="schedule"
                      value={day}
                      defaultChecked={defaults?.schedule.includes(day)}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="full" htmlFor="job-skills">
              Skills · up to 8, separated by commas
              <input
                id="job-skills"
                name="skills"
                required
                maxLength={480}
                defaultValue={defaults?.skills.join(', ')}
                placeholder="Customer service, communication, teamwork"
              />
            </label>
            <label className="full" htmlFor="job-must-haves">
              Must-haves · 1–3, one per line
              <textarea
                id="job-must-haves"
                name="mustHaves"
                rows={3}
                required
                maxLength={482}
                defaultValue={defaults?.mustHaves.join('\n')}
              />
              <small>Describe the skills needed. Do not require Canadian experience.</small>
            </label>
            <label className="full" htmlFor="job-nice-haves">
              Nice-to-haves · up to 3, one per line
              <textarea
                id="job-nice-haves"
                name="niceToHaves"
                rows={3}
                maxLength={482}
                defaultValue={defaults?.niceToHaves.join('\n')}
              />
            </label>
            <label className="full" htmlFor="job-questions">
              Structured interview questions · 3–5, one per line
              <textarea
                id="job-questions"
                name="questions"
                rows={5}
                required
                maxLength={1504}
                defaultValue={defaults?.questions.join('\n')}
              />
              <small>Use the same questions for every candidate applying to this role.</small>
            </label>
            <label htmlFor="job-workplace">
              Workplace type
              <select
                id="job-workplace"
                name="workplaceType"
                defaultValue={defaults?.workplaceType ?? 'office'}
              >
                <option value="office">Office</option>
                <option value="retail">Retail</option>
                <option value="restaurant_service">Restaurant serving area</option>
                <option value="restaurant_kitchen">Restaurant kitchen</option>
                <option value="warehouse">Warehouse</option>
                <option value="construction">Construction</option>
              </select>
              <small>
                Workplace type determines eligibility. Employers cannot set age preferences.
              </small>
            </label>
            <label htmlFor="job-vacancy">
              Is this an existing vacancy?
              <select
                id="job-vacancy"
                name="vacancy"
                defaultValue={defaults ? (defaults.isVacancy ? 'yes' : 'no') : ''}
                required
              >
                <option value="" disabled>
                  Select an answer
                </option>
                <option value="yes">Yes, an existing vacancy</option>
                <option value="no">No, a future opportunity</option>
              </select>
            </label>
            <label className="full" htmlFor="job-ai">
              Do you use AI to screen, assess, or select applicants?
              <select
                id="job-ai"
                name="ai"
                defaultValue={defaults ? (defaults.usesAiScreening ? 'yes' : 'no') : ''}
                required
              >
                <option value="" disabled>
                  Select an answer
                </option>
                <option value="no">No</option>
                <option value="yes">Yes — disclose on the posting</option>
              </select>
            </label>
          </div>
        </fieldset>
        {errors.length > 0 && (
          <div className="live-error" role="alert">
            <strong>Check these details before saving:</strong>
            <ul>
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="live-form-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Saving draft…' : 'Save draft'}
          </button>
        </div>
      </form>
    </section>
  );
}

function toDeckCard(card: LiveCandidateCard): DeckCardContent {
  return {
    id: card.cardRef,
    monogram: '✳',
    name: card.handle,
    headline: card.headline,
    meta: `${card.education.level} · ${card.education.field} · ${card.education.status}`,
    chips: card.skills,
    badge: card.applied ? 'Applied to your role' : 'Open to opportunities',
    details: (
      <>
        <h4>What they bring</h4>
        {card.bullets.length ? (
          <ul>
            {card.bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        ) : (
          <p>No experience bullets yet.</p>
        )}
        <h4>Skills</h4>
        <p>{card.skills.join(' · ')}</p>
        <p>Identity protected · approved profile</p>
      </>
    ),
  };
}
