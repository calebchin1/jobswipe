'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  createDemoState,
  demoReducer,
  getApplicationStage,
  getRevealedIdentity,
  calculateFit,
} from '@swipe/domain';
import { JobSchema, type DemoAction, type DemoState } from '@swipe/contracts';
import { DeckStack, MatchOverlay, RoundButtons } from './deck';
import styles from './employer-workspace.module.css';

type View = 'discover' | 'pipeline' | 'interviews' | 'jobs';
type Stage = 'Matched' | 'Interview booked' | 'Interviewed' | 'Revealed';
type Candidate = {
  id: string;
  headline: string;
  field: string;
  school: string;
  skills: string[];
  bullets: string[];
  availability: string;
  commute: string;
  applied: boolean;
};
const fixture = createDemoState();
const candidates: Candidate[] = fixture.candidates.map((c) => ({
  id: c.handle.replace('Candidate ', ''),
  headline: c.headline,
  school: c.education.school ?? 'School not provided',
  field: `${c.education.level} in ${c.education.field}`,
  skills: c.skills,
  bullets: c.bullets,
  availability: `${c.availability.hoursPerWeek} hours / week`,
  commute: `${c.commuteMinutes} min · transit estimate`,
  applied: fixture.applications.some((a) => a.candidateId === c.id && a.candidateInterested),
}));
const questions = fixture.jobs[0].questions;
const initialJob = {
  title: 'Café team member',
  min: '18',
  max: '22',
  hours: '16',
  location: 'Uptown Waterloo',
  ai: false,
  vacancy: true,
};

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    discover: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="m9 10 3 3 3-3" />
      </>
    ),
    pipeline: (
      <>
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="11" rx="1" />
        <rect x="17" y="4" width="4" height="14" rx="1" />
      </>
    ),
    interviews: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 11h18m-12 4h3" />
      </>
    ),
    jobs: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V3h8v4M3 13h18m-10-2v4h2v-4" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    audio: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.discover}
    </svg>
  );
}

export function EmployerWorkspace() {
  const [mobileLayout, setMobileLayout] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const update = () => setMobileLayout(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [view, setView] = useState<View>('discover');
  const [index, setIndex] = useState(0);
  const [state, setState] = useState<DemoState>(createDemoState);
  const pipeline = Object.fromEntries(
    state.applications
      .filter((a) => a.candidateInterested && a.employerInterested && !a.withdrawnAt)
      .map((a) => [
        state.candidates.find((c) => c.id === a.candidateId)!.handle.replace('Candidate ', ''),
        getApplicationStage(a),
      ]),
  ) as Record<string, Stage>;
  const [selected, setSelected] = useState('A7F2');
  const [scores, setScores] = useState<Record<string, number[]>>({});
  const locked = state.applications
    .filter((a) => a.scorecard)
    .map((a) =>
      state.candidates.find((c) => c.id === a.candidateId)!.handle.replace('Candidate ', ''),
    );
  const consents = state.applications
    .filter((a) => a.authorizedAt)
    .map((a) =>
      state.candidates.find((c) => c.id === a.candidateId)!.handle.replace('Candidate ', ''),
    );
  const [notice, setNotice] = useState('');
  const [job, setJob] = useState(initialJob);
  const [editingJob, setEditingJob] = useState(false);
  const [formError, setFormError] = useState('');
  const [undo, setUndo] = useState<{ index: number; state: DemoState } | null>(null);
  const [undoUsed, setUndoUsed] = useState(false);
  const [applicantsOnly, setApplicantsOnly] = useState(false);
  const [matchWith, setMatchWith] = useState('');
  const visibleCandidates = candidates.filter(
    (c) =>
      !state.applications.some(
        (a) =>
          a.withdrawnAt &&
          state.candidates.find((source) => source.id === a.candidateId)?.handle ===
            `Candidate ${c.id}`,
      ),
  );
  const deck = applicantsOnly ? visibleCandidates.filter((c) => c.applied) : visibleCandidates;
  const candidate = deck[index];
  const sourceCandidate = candidate
    ? state.candidates.find((c) => c.handle === `Candidate ${candidate.id}`)
    : undefined;
  const fit = sourceCandidate
    ? calculateFit(sourceCandidate, {
        ...state.jobs.find((j) => j.id === state.selectedJobId)!,
        hoursPerWeek: Number(job.hours),
      })
    : undefined;
  const current = candidates.find((c) => c.id === selected)!;
  const activeScores = scores[selected] || [0, 0, 0];
  const stage = pipeline[selected];
  const application = state.applications.find(
    (a) => a.candidateId === state.candidates.find((c) => c.handle === `Candidate ${selected}`)?.id,
  );
  const identity = application ? getRevealedIdentity(state, application.id) : null;
  function transition(action: DemoAction) {
    try {
      setState(demoReducer(state, action));
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'This action could not be completed.');
      return false;
    }
  }
  const matched = Object.keys(pipeline).length;
  const navigate = (next: View) => {
    setView(next);
    setNotice('');
    setUndo(null);
  };
  function swipe(interested: boolean) {
    if (!candidate) return;
    // A mutual match is a committed workflow event and cannot be undone.
    setUndo(interested && candidate.applied ? null : { index, state });
    if (interested) {
      const source = state.candidates.find((c) => c.handle === `Candidate ${candidate.id}`)!;
      if (
        !transition({
          type: 'EMPLOYER_INTEREST',
          jobId: state.selectedJobId,
          candidateId: source.id,
        })
      )
        return;
      if (candidate.applied) {
        setSelected(candidate.id);
        setMatchWith(`Candidate ${candidate.id}`);
      }
    }
    setNotice(
      interested
        ? candidate.applied
          ? `You matched with Candidate ${candidate.id}. Find them in your pipeline. Mutual matches cannot be undone.`
          : `Demo interest recorded for Candidate ${candidate.id}. A match needs their application too.`
        : `Candidate ${candidate.id} passed for this session.`,
    );
    setIndex((i) => i + 1);
  }
  function saveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const min = Number(data.get('min'));
    const max = Number(data.get('max'));
    const title = String(data.get('title') || '').trim();
    const hours = Number(data.get('hours'));
    const requirements = String(data.get('requirements') || '');
    if (min <= 0 || max < min) {
      setFormError('Enter positive hourly pay, with the maximum at least the minimum.');
      return;
    }
    if (/canadian\s+(?:work\s+)?experience/i.test(`${title} ${requirements}`)) {
      setFormError(
        'Remove the Canadian experience requirement. Describe the skills needed for the role instead.',
      );
      return;
    }
    const validated = JobSchema.safeParse({
      ...fixture.jobs[0],
      title,
      payMin: min,
      payMax: max,
      location: String(data.get('location')),
      hoursPerWeek: hours,
      mustHaves: requirements
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      isVacancy: data.get('vacancy') === 'yes',
      usesAiScreening: data.get('ai') === 'yes',
    });
    if (!validated.success) {
      setFormError(validated.error.issues[0].message);
      return;
    }
    setJob({
      title,
      min: String(min),
      max: String(max),
      location: String(data.get('location')),
      hours: String(data.get('hours')),
      ai: data.get('ai') === 'yes',
      vacancy: data.get('vacancy') === 'yes',
    });
    setEditingJob(false);
    setFormError('');
    setNotice('Job saved in this demo session. No posting was published.');
  }
  return (
    <div
      className={`app-shell ${styles.workspace}`}
      inert={!ready}
      data-ready={ready}
      data-view={view}
    >
      <a className="skip-link" href="#main">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="First home">
          <span className="brand-mark">
            f<span>↗</span>
          </span>
          first<span className="brand-period">.</span>
        </a>
        <div className="workspace-label">EMPLOYER WORKSPACE</div>
        <div className="company-switch">
          <span className="company-logo">N</span>
          <div>
            <strong>Northside Coffee</strong>
            <small>Fictional demo company</small>
          </div>
          <span className="chevron">⌄</span>
        </div>
        <nav aria-label="Main navigation">
          {(
            [
              ['discover', 'Discover talent'],
              ['pipeline', 'Your pipeline'],
              ['interviews', 'Interviews'],
              ['jobs', 'Your jobs'],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? 'active' : ''}`}
              onClick={() => navigate(id)}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon name={id} />
              <span>{label}</span>
              {id === 'pipeline' && matched > 0 && <span className="nav-count">{matched}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="fairness-note">
            <Icon name="lock" />
            <strong>Potential comes first.</strong>
            <p>Names stay hidden while you get to know the person behind the skills.</p>
          </div>
          <button
            className="support-button"
            onClick={() =>
              setNotice(
                'This is a local synthetic demo. For a live product, reporting and support must connect to a staffed review queue.',
              )
            }
          >
            ⓘ Demo help & reporting
          </button>
          <div className="account">
            <span className="account-avatar">NC</span>
            <div>
              <strong>Hiring team</strong>
              <small>Demo workspace</small>
            </div>
            <span className="account-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>
              {view === 'discover'
                ? 'Discover talent'
                : view === 'pipeline'
                  ? 'Your pipeline'
                  : view === 'interviews'
                    ? 'Interviews'
                    : 'Your jobs'}
            </strong>
          </div>
          <div className="topbar-actions">
            <details className="workspace-options" open={!mobileLayout}>
              <summary aria-label="Workspace options">
                Options <span aria-hidden="true">⌄</span>
              </summary>
              <div className="workspace-options-content">
                <a href="/sign-in" className="live-auth-link">
                  Sign in to live workspace ↗
                </a>
                <button
                  className="reset-demo"
                  onClick={() => {
                    setState(createDemoState());
                    setIndex(0);
                    setScores({});
                    setSelected('A7F2');
                    setUndo(null);
                    setUndoUsed(false);
                    setApplicantsOnly(false);
                    setView('discover');
                    setJob(initialJob);
                    setEditingJob(false);
                    setNotice('Demo reset. All changes in this session have been cleared.');
                  }}
                >
                  Reset demo
                </button>
              </div>
            </details>
            <span className="demo-badge">
              <span />
              Synthetic demo
            </span>
          </div>
        </header>
        <MatchOverlay
          open={!!matchWith}
          body={`You and ${matchWith} are both interested. In the full product they would book a short audio interview next. Identity stays protected.`}
          primary={{
            label: 'View your pipeline',
            onClick: () => {
              setMatchWith('');
              navigate('pipeline');
            },
          }}
          onClose={() => setMatchWith('')}
        />
        <main id="main">
          {view !== 'discover' && (
            <div className="page-heading">
              <div>
                <div className="eyebrow">GOOD PEOPLE. GREAT POSSIBILITIES.</div>
                <h1>
                  {view === 'pipeline'
                    ? 'From first match to next step.'
                    : view === 'interviews'
                      ? 'Let their experience speak.'
                      : 'Make a great first impression.'}
                </h1>
                <p>
                  {view === 'pipeline'
                    ? 'A thoughtful process, one conversation at a time.'
                    : view === 'interviews'
                      ? 'Structured questions. An open mind. A better first conversation.'
                      : 'Clear expectations help the right people find you.'}
                </p>
              </div>
              <button
                className="button secondary new-job"
                onClick={() => {
                  navigate('jobs');
                  setEditingJob(true);
                }}
              >
                <Icon name="jobs" size={17} />
                Edit demo job
              </button>
            </div>
          )}
          <div className="demo-notice">
            <Icon name="lock" size={16} />
            <span className="demo-notice-full">
              Fictional profiles only. Changes last until refresh. No live authentication, calls,
              email, or publishing.
            </span>
            <span className="demo-notice-compact">Fictional demo · Changes reset on refresh</span>
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label="Dismiss notification" onClick={() => setNotice('')}>
                <Icon name="x" size={16} />
              </button>
            </div>
          )}
          {view === 'discover' && (
            <>
              <section className="job-strip" aria-label="Selected role">
                <div className="job-strip-icon">
                  <Icon name="jobs" size={23} />
                </div>
                <div className="job-strip-title">
                  <span>HIRING FOR</span>
                  <h2>{job.title}</h2>
                  <p>
                    {job.location} <span>·</span> Part-time <span>·</span> ${job.min}–${job.max} CAD
                    / hr
                  </p>
                </div>
                <div className="job-status">
                  <span />
                  Demo opening
                </div>
              </section>
              <div className="discovery-grid">
                <section className="deck-section" aria-label="Anonymous candidate deck">
                  <div className="section-bar">
                    <h2>
                      Your candidate shortlist <span>{Math.max(0, deck.length - index)}</span>
                    </h2>
                    <label className="filter-label">
                      <input
                        type="checkbox"
                        checked={applicantsOnly}
                        onChange={(e) => {
                          setApplicantsOnly(e.target.checked);
                          setIndex(0);
                          setUndo(null);
                        }}
                      />
                      Applicants only
                    </label>
                  </div>
                  <div className="review-progress">
                    <span>
                      {Math.min(index, deck.length)} of {deck.length} profiles reviewed in this view
                    </span>
                    <progress
                      aria-label="Shortlist review progress"
                      value={Math.min(index, deck.length)}
                      max={Math.max(1, deck.length)}
                    />
                  </div>
                  {candidate ? (
                    <DeckStack
                      cards={deck.slice(index, index + 2).map((item) => ({
                        id: item.id,
                        monogram: '✳',
                        name: `Candidate ${item.id}`,
                        headline: item.headline,
                        school: item.school,
                        degree: item.field,
                        availability: item.availability.replace(' hours / week', ''),
                        skills: item.skills,
                        badge: item.applied ? '↗ Applied to your job' : 'Open to opportunities',
                        evidence: item.bullets,
                        details: (
                          <>
                            {item.id === candidate.id && fit && (
                              <>
                                <h4>Why this candidate?</h4>
                                <ul>
                                  {fit.reasons.map((reason) => (
                                    <li key={reason}>{reason}</li>
                                  ))}
                                </ul>
                              </>
                            )}
                          </>
                        ),
                      }))}
                      onSwipe={(_, direction) => swipe(direction === 'right')}
                    />
                  ) : (
                    <div className="empty-card">
                      <span>✳</span>
                      <h2>You’re all caught up.</h2>
                      <p>
                        You’ve reviewed every profile in this demo shortlist. Your matches are ready
                        in the pipeline.
                      </p>
                      <button className="button primary" onClick={() => navigate('pipeline')}>
                        Open your pipeline <Icon name="arrow" size={17} />
                      </button>
                    </div>
                  )}
                  <RoundButtons
                    actions={[
                      {
                        label: 'Undo last pass or unmatched interest once per session',
                        glyph: '↶',
                        tone: 'undo',
                        caption: 'Undo once',
                        disabled: !undo || undoUsed,
                        onClick: () => {
                          if (undo) {
                            setIndex(undo.index);
                            setState(undo.state);
                            setUndo(null);
                            setUndoUsed(true);
                            setNotice(
                              'Last action undone. Your one undo for this session has been used.',
                            );
                          }
                        },
                      },
                      {
                        label: 'Pass for now',
                        glyph: '✕',
                        tone: 'pass',
                        caption: 'Pass',
                        big: true,
                        disabled: !candidate,
                        onClick: () => swipe(false),
                      },
                      {
                        label: 'I’m interested',
                        glyph: '✓',
                        tone: 'like',
                        caption: 'Interested',
                        big: true,
                        disabled: !candidate,
                        onClick: () => swipe(true),
                      },
                    ]}
                  />
                  <p className="touch-hint">Swipe right if you’re interested, left to pass</p>
                  <p className="keyboard-hint">
                    Focus the card and use <kbd>←</kbd> to pass or <kbd>→</kbd> for interested
                  </p>
                </section>
                <aside className="insights">
                  <section className="next-step-card">
                    <span className="small-label">YOUR NEXT STEP</span>
                    <h2>
                      {matched
                        ? `${matched} mutual ${matched === 1 ? 'match' : 'matches'}.`
                        : 'Find your first connection.'}
                    </h2>
                    <p>
                      {matched
                        ? 'Your matches are ready for a conversation. Take the next step in your pipeline.'
                        : 'Review their skills. If you’re both interested, they’ll appear in your pipeline.'}
                    </p>
                    <button className="button primary" onClick={() => navigate('pipeline')}>
                      Open your pipeline <Icon name="arrow" size={17} />
                    </button>
                  </section>
                  <section className="how-card">
                    <span className="small-label">A DIFFERENT FIRST IMPRESSION</span>
                    <h2>
                      Skills first.
                      <br />
                      People always.
                    </h2>
                    <div className="steps">
                      <div>
                        <span>01</span>
                        <p>
                          <strong>Find the potential</strong>Review skills, experience, and
                          availability. Names stay private.
                        </p>
                      </div>
                      <div>
                        <span>02</span>
                        <p>
                          <strong>Make a connection</strong>Mutual interest opens the door to an
                          anonymous conversation.
                        </p>
                      </div>
                      <div>
                        <span>03</span>
                        <p>
                          <strong>Meet the person</strong>Interview, lock in your scorecard, then
                          request identity sharing.
                        </p>
                      </div>
                    </div>
                    <div className="how-footer">
                      <Icon name="lock" size={15} />
                      Built around a fairer first step
                    </div>
                  </section>
                  <section className="activity-card">
                    <div className="section-bar">
                      <h3>Your hiring, at a glance</h3>
                      <span>THIS SESSION</span>
                    </div>
                    <div className="stat-row">
                      <span>Reviewed in this view</span>
                      <strong>{index}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Mutual matches</span>
                      <strong className="green-text">{matched}</strong>
                    </div>
                    <div className="stat-row">
                      <span>Identities shared</span>
                      <strong>
                        {Object.values(pipeline).filter((s) => s === 'Revealed').length}
                      </strong>
                    </div>
                  </section>
                  <p className="privacy-footnote">
                    No names. No photos. Education shared with approval.
                    <br />
                    Just the things that matter for the role.
                  </p>
                </aside>
              </div>
            </>
          )}
          {view === 'pipeline' && (
            <section className="panel">
              <div className="section-bar">
                <h2>{job.title}</h2>
                <span className="subtle">{matched} mutual matches</span>
              </div>
              {matched === 0 ? (
                <div className="empty-state">
                  <Icon name="pipeline" size={34} />
                  <h2>Good conversations start with a match.</h2>
                  <p>Show interest in a candidate who has applied to move them here.</p>
                  <button className="button primary" onClick={() => navigate('discover')}>
                    Discover talent <Icon name="arrow" size={17} />
                  </button>
                </div>
              ) : (
                <div className="pipeline-board">
                  {(['Matched', 'Interview booked', 'Interviewed', 'Revealed'] as Stage[]).map(
                    (column) => (
                      <div className="pipeline-column" key={column}>
                        <h3>
                          <span className={`stage-dot stage-${column.replaceAll(' ', '-')}`} />
                          {column}
                          <span>{Object.values(pipeline).filter((s) => s === column).length}</span>
                        </h3>
                        {candidates
                          .filter((c) => pipeline[c.id] === column)
                          .map((c) => (
                            <button
                              className="pipeline-card"
                              key={c.id}
                              onClick={() => {
                                setSelected(c.id);
                                navigate('interviews');
                              }}
                            >
                              <span className="privacy-label">
                                <Icon name="lock" size={12} />
                                {column === 'Revealed'
                                  ? 'Sharing authorized'
                                  : 'Identity protected'}
                              </span>
                              <strong>Candidate {c.id}</strong>
                              <p>{c.headline}</p>
                              <span className="pipeline-next">
                                {column === 'Matched'
                                  ? 'Schedule interview'
                                  : column === 'Interview booked'
                                    ? 'Open interview'
                                    : column === 'Interviewed'
                                      ? 'Review scorecard'
                                      : 'View shared profile'}{' '}
                                <Icon name="arrow" size={14} />
                              </span>
                            </button>
                          ))}
                      </div>
                    ),
                  )}
                </div>
              )}
            </section>
          )}
          {view === 'interviews' && (
            <section className="interview-layout">
              <div className="panel">
                <div className="section-bar">
                  <h2>Blind interview workspace</h2>
                  <span className="tag">Audio only · simulated</span>
                </div>
                {matched === 0 ? (
                  <div className="empty-state">
                    <Icon name="audio" size={36} />
                    <h2>Your first conversation is ahead.</h2>
                    <p>
                      Match with an applicant to try scheduling, scorecards, and authorized sharing.
                    </p>
                    <button className="button primary" onClick={() => navigate('discover')}>
                      Find a candidate
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="field-label" htmlFor="interview-candidate">
                      Candidate
                    </label>
                    <select
                      id="interview-candidate"
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      {candidates
                        .filter((c) => pipeline[c.id])
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            Candidate {c.id}
                          </option>
                        ))}
                    </select>
                    <div className="interview-profile">
                      <span className="candidate-symbol">✳</span>
                      <div>
                        <h2>Candidate {current.id}</h2>
                        <p>{current.headline}</p>
                      </div>
                      <span className="tag">{stage}</span>
                    </div>
                    {stage === 'Matched' && (
                      <div className="workflow-step">
                        <h3>Choose a demo interview slot</h3>
                        <p>All times in America/Toronto. This schedules a local simulation only.</p>
                        <button
                          className="button primary"
                          onClick={() => {
                            if (
                              !application ||
                              !transition({
                                type: 'BOOK_INTERVIEW',
                                applicationId: application.id,
                                startsAt: '2026-10-14T14:00:00.000Z',
                                at: '2026-09-28T12:00:00.000Z',
                              })
                            )
                              return;
                            setNotice('Demo interview booked. No calendar invitation was sent.');
                          }}
                        >
                          October 14 · 10:00–10:15 AM <Icon name="arrow" size={16} />
                        </button>
                      </div>
                    )}
                    {stage === 'Interview booked' && (
                      <div className="audio-demo">
                        <div className="audio-orb">
                          <Icon name="audio" size={35} />
                        </div>
                        <h3>Ready to listen.</h3>
                        <p>
                          No call is connected. In production, verified attendance from both
                          participants is required.
                        </p>
                        <button
                          className="button primary"
                          onClick={() => {
                            if (
                              !application ||
                              !transition({
                                type: 'COMPLETE_INTERVIEW',
                                applicationId: application.id,
                                candidateAttended: true,
                                employerAttended: true,
                                at: '2026-10-14T14:15:00.000Z',
                              })
                            )
                              return;
                            setNotice(
                              'Synthetic interview attendance recorded for both participants.',
                            );
                          }}
                        >
                          Simulate completed interview
                        </button>
                      </div>
                    )}
                    {(stage === 'Interviewed' || stage === 'Revealed') && (
                      <div className="scorecard">
                        <h3>Structured scorecard</h3>
                        <p className="subtle">
                          Rate every answer before sharing is available. Submitted scores are
                          locked.
                        </p>
                        {questions.map((q, i) => (
                          <fieldset key={q} disabled={locked.includes(selected)}>
                            <legend>
                              <span>{String(i + 1).padStart(2, '0')}</span>
                              {q}
                            </legend>
                            <div className="rating-options">
                              {[1, 2, 3, 4, 5].map((value) => (
                                <label
                                  className={activeScores[i] === value ? 'selected' : ''}
                                  key={value}
                                >
                                  <input
                                    type="radio"
                                    name={`${selected}-question-${i}`}
                                    value={value}
                                    checked={activeScores[i] === value}
                                    onChange={() =>
                                      setScores((s) => ({
                                        ...s,
                                        [selected]: activeScores.map((n, idx) =>
                                          idx === i ? value : n,
                                        ),
                                      }))
                                    }
                                  />
                                  {value}
                                </label>
                              ))}
                              <span>1 = limited evidence · 5 = strong evidence</span>
                            </div>
                          </fieldset>
                        ))}
                        <button
                          className="button primary"
                          disabled={activeScores.some((s) => !s) || locked.includes(selected)}
                          onClick={() => {
                            if (
                              !application ||
                              !transition({
                                type: 'SUBMIT_SCORECARD',
                                applicationId: application.id,
                                scores: activeScores,
                              })
                            )
                              return;
                            setNotice('Scorecard submitted and locked for this demo interview.');
                          }}
                        >
                          <Icon name="lock" size={16} />
                          {locked.includes(selected)
                            ? 'Scorecard locked'
                            : 'Submit & lock scorecard'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <aside className="panel reveal-panel">
                <Icon name="lock" size={25} />
                <h2>A name comes with trust.</h2>
                <p>
                  The candidate controls when their approved identity and resume are shared with
                  your team.
                </p>
                <ul className="prerequisite-list">
                  <li className={stage === 'Interviewed' || stage === 'Revealed' ? 'done' : ''}>
                    <Icon name="check" size={15} />
                    Interview completed
                  </li>
                  <li className={locked.includes(selected) ? 'done' : ''}>
                    <Icon name="check" size={15} />
                    Scorecard submitted
                  </li>
                  <li className={consents.includes(selected) ? 'done' : ''}>
                    <Icon name="check" size={15} />
                    Candidate authorizes sharing
                  </li>
                </ul>
                {locked.includes(selected) && !consents.includes(selected) && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (
                        !application ||
                        !transition({ type: 'AUTHORIZE_REVEAL', applicationId: application.id })
                      )
                        return;
                      setNotice(
                        'Synthetic candidate consent recorded. In production, only the candidate can authorize this.',
                      );
                    }}
                  >
                    Simulate candidate authorization
                  </button>
                )}
                {consents.includes(selected) && stage !== 'Revealed' && (
                  <button
                    className="button primary"
                    onClick={() => {
                      if (
                        !application ||
                        !transition({ type: 'REVEAL', applicationId: application.id })
                      )
                        return;
                      setNotice('Fictional identity shared locally. No resume or email was sent.');
                    }}
                  >
                    Reveal demo identity
                  </button>
                )}
                {stage === 'Revealed' && identity && (
                  <div className="revealed-identity">
                    <span className="small-label">AUTHORIZED DEMO IDENTITY</span>
                    <h3>{identity?.displayName}</h3>
                    <p>{identity?.email}</p>
                    <small>Fictional contact. No resume file exists in this demo.</small>
                  </div>
                )}
                <p className="privacy-footnote">
                  Birth date and precise location are never part of an employer reveal.
                </p>
                {application && !application.withdrawnAt && (
                  <button
                    className="withdraw-demo"
                    onClick={() => {
                      if (!transition({ type: 'WITHDRAW', applicationId: application.id })) return;
                      const nextApplication = state.applications.find(
                        (a) =>
                          a.id !== application.id &&
                          a.candidateInterested &&
                          a.employerInterested &&
                          !a.withdrawnAt,
                      );
                      if (nextApplication)
                        setSelected(
                          state.candidates
                            .find((c) => c.id === nextApplication.candidateId)!
                            .handle.replace('Candidate ', ''),
                        );
                      setView('pipeline');
                      setUndo(null);
                      setNotice(
                        'Synthetic candidate withdrew. Future identity access has been revoked; previously downloaded copies could not be recalled in a live system.',
                      );
                    }}
                  >
                    Simulate candidate withdrawal
                  </button>
                )}
              </aside>
            </section>
          )}
          {view === 'jobs' && (
            <section className="panel job-management">
              <div className="section-bar">
                <h2>{editingJob ? 'Edit demo job' : 'Your active demo role'}</h2>
                <span className="tag">Local session only</span>
              </div>
              {!editingJob ? (
                <>
                  <div className="job-overview">
                    <div className="job-strip-icon">
                      <Icon name="jobs" size={28} />
                    </div>
                    <div>
                      <h2>{job.title}</h2>
                      <p>
                        {job.location} · ${job.min}–${job.max} CAD / hour · {job.hours} hours per
                        week
                      </p>
                      <div className="skill-tags">
                        <span>{job.vacancy ? 'Existing vacancy' : 'Future opportunity'}</span>
                        <span>{job.ai ? 'AI used in screening' : 'No AI screening declared'}</span>
                      </div>
                    </div>
                  </div>
                  <button className="button secondary" onClick={() => setEditingJob(true)}>
                    Edit demo posting
                  </button>
                  <p className="form-note">
                    This form demonstrates disclosure fields. Production publishing requires
                    verified employers and a reviewed posting policy.
                  </p>
                </>
              ) : (
                <form onSubmit={saveJob}>
                  <div className="form-grid">
                    <label>
                      Job title
                      <input name="title" required maxLength={100} defaultValue={job.title} />
                    </label>
                    <label>
                      Location
                      <input name="location" required maxLength={100} defaultValue={job.location} />
                    </label>
                    <label>
                      Minimum pay · CAD / hour
                      <input
                        name="min"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        defaultValue={job.min}
                      />
                    </label>
                    <label>
                      Maximum pay · CAD / hour
                      <input
                        name="max"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        defaultValue={job.max}
                      />
                    </label>
                    <label>
                      Hours per week
                      <input
                        name="hours"
                        type="number"
                        min="1"
                        max="60"
                        step="1"
                        required
                        defaultValue={job.hours}
                      />
                    </label>
                    <label>
                      Existing vacancy?
                      <select name="vacancy" defaultValue={job.vacancy ? 'yes' : 'no'}>
                        <option value="yes">Yes, we are filling a vacancy</option>
                        <option value="no">No, a future opportunity</option>
                      </select>
                    </label>
                    <label className="full-width">
                      Must-have skills
                      <textarea
                        name="requirements"
                        rows={3}
                        required
                        defaultValue="Customer service, teamwork, weekend availability"
                        maxLength={500}
                      />
                    </label>
                    <label className="full-width">
                      Do you use AI to screen, assess, or select applicants?
                      <select name="ai" defaultValue={job.ai ? 'yes' : 'no'}>
                        <option value="no">No</option>
                        <option value="yes">Yes — disclose on the posting</option>
                      </select>
                    </label>
                  </div>
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setEditingJob(false);
                        setFormError('');
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="button primary">
                      Save demo job <Icon name="check" size={16} />
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}
          <footer className="page-footer">
            <span>
              first. <span>More potential. Less bias.</span>
            </span>
            <span>
              Built for Waterloo & beyond <span className="footer-spark">✳</span>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
