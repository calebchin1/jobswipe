import {
  JobSchema,
  ScoreSchema,
  type ApplicationStage,
  type DemoAction,
  type DemoApplication,
  type DemoIdentity,
  type DemoState,
} from '@swipe/contracts';
import { createDemoState } from './fixtures';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
const requireCondition: (value: unknown, code: string, message: string) => asserts value = (
  value,
  code,
  message,
) => {
  if (!value) throw new DomainError(code, message);
};

export function getApplicationStage(application: DemoApplication): ApplicationStage {
  if (application.withdrawnAt) return 'Withdrawn';
  if (application.revealedAt) return 'Revealed';
  if (application.interview?.completedAt) return 'Interviewed';
  if (application.interview) return 'Interview booked';
  if (application.candidateInterested && application.employerInterested) return 'Matched';
  return application.candidateInterested ? 'Applied' : 'Interested';
}

/** Pure synthetic walkthrough. Real permissions live in Postgres, never in this reducer. */
export function demoReducer(previous: DemoState, action: DemoAction): DemoState {
  if (action.type === 'RESET') return createDemoState();
  if (action.type === 'SELECT_JOB') {
    requireCondition(
      previous.jobs.some((job) => job.id === action.jobId),
      'NOT_FOUND',
      'Job unavailable.',
    );
    return { ...previous, selectedJobId: action.jobId };
  }
  if (action.type === 'ADD_JOB') {
    const job = JobSchema.parse(action.job);
    requireCondition(
      !previous.jobs.some((existing) => existing.id === job.id),
      'DUPLICATE',
      'This job already exists.',
    );
    return { ...previous, jobs: [...previous.jobs, job] };
  }
  const at = action.at ?? new Date().toISOString();
  requireCondition(
    Number.isFinite(Date.parse(at)),
    'INVALID_DATE',
    'A valid timestamp is required.',
  );
  const state: DemoState = structuredClone(previous);
  let application: DemoApplication | undefined;
  if (action.type === 'APPLIED' || action.type === 'EMPLOYER_INTEREST') {
    const job = state.jobs.find((item) => item.id === action.jobId);
    requireCondition(
      job?.status === 'open',
      'JOB_UNAVAILABLE',
      'This job is not accepting interest.',
    );
    requireCondition(
      state.candidates.some((candidate) => candidate.id === action.candidateId),
      'NOT_FOUND',
      'Candidate unavailable.',
    );
    application = state.applications.find(
      (item) => item.jobId === action.jobId && item.candidateId === action.candidateId,
    );
    if (!application) {
      application = {
        id: `application-${action.jobId}-${action.candidateId}`,
        jobId: action.jobId,
        candidateId: action.candidateId,
        candidateInterested: false,
        employerInterested: false,
        interview: null,
        scorecard: null,
        authorizedAt: null,
        revealedAt: null,
        withdrawnAt: null,
      };
      state.applications.push(application);
    }
    requireCondition(!application.withdrawnAt, 'WITHDRAWN', 'This application was withdrawn.');
    const key = action.type === 'APPLIED' ? 'candidateInterested' : 'employerInterested';
    if (application[key]) return previous;
    application[key] = true;
  } else {
    application = state.applications.find((item) => item.id === action.applicationId);
    requireCondition(application, 'NOT_FOUND', 'Application unavailable.');
    if (action.type === 'WITHDRAW') {
      if (application.withdrawnAt) return previous;
      application.withdrawnAt = at;
      application.authorizedAt = null;
      application.revealedAt = null;
    } else {
      requireCondition(!application.withdrawnAt, 'WITHDRAWN', 'This application was withdrawn.');
      requireCondition(
        application.candidateInterested && application.employerInterested,
        'NOT_MATCHED',
        'Both sides must be interested first.',
      );
      switch (action.type) {
        case 'BOOK_INTERVIEW':
          requireCondition(
            !application.interview,
            'ALREADY_BOOKED',
            'An interview is already booked.',
          );
          requireCondition(
            Number.isFinite(Date.parse(action.startsAt)) &&
              Date.parse(action.startsAt) > Date.parse(at),
            'INVALID_DATE',
            'Choose a future interview time.',
          );
          application.interview = {
            startsAt: action.startsAt,
            completedAt: null,
            candidateAttended: false,
            employerAttended: false,
          };
          break;
        case 'COMPLETE_INTERVIEW':
          requireCondition(application.interview, 'NOT_BOOKED', 'Book an interview first.');
          requireCondition(
            action.candidateAttended && action.employerAttended,
            'ATTENDANCE_REQUIRED',
            'Both participants must attend the interview.',
          );
          if (application.interview.completedAt) return previous;
          application.interview = {
            ...application.interview,
            candidateAttended: true,
            employerAttended: true,
            completedAt: at,
          };
          break;
        case 'SUBMIT_SCORECARD': {
          requireCondition(
            application.interview?.completedAt,
            'INTERVIEW_REQUIRED',
            'Complete the interview first.',
          );
          requireCondition(
            !application.scorecard,
            'SCORECARD_LOCKED',
            'Submitted scores cannot be changed.',
          );
          const jobId = application.jobId;
          const job = state.jobs.find((item) => item.id === jobId);
          requireCondition(
            job &&
              action.scores.length === job.questions.length &&
              action.scores.every((score) => ScoreSchema.safeParse(score).success),
            'INVALID_SCORES',
            'Score every question from 1 to 5.',
          );
          application.scorecard = { scores: [...action.scores], submittedAt: at };
          break;
        }
        case 'AUTHORIZE_REVEAL':
          requireCondition(
            application.scorecard,
            'SCORECARD_REQUIRED',
            'Submit the scorecard before asking the candidate to share.',
          );
          if (application.authorizedAt) return previous;
          application.authorizedAt = at;
          break;
        case 'REVEAL':
          requireCondition(
            application.interview?.completedAt && application.scorecard && application.authorizedAt,
            'REVEAL_BLOCKED',
            'A completed interview, locked scorecard and candidate authorization are required.',
          );
          if (application.revealedAt) return previous;
          application.revealedAt = at;
          break;
      }
    }
  }
  const descriptions: Record<string, string> = {
    APPLIED: 'Candidate applied',
    EMPLOYER_INTEREST: 'Employer expressed interest',
    BOOK_INTERVIEW: 'Interview booked',
    COMPLETE_INTERVIEW: 'Demo interview completed by both participants',
    SUBMIT_SCORECARD: 'Scorecard submitted and locked',
    AUTHORIZE_REVEAL: 'Demo candidate authorized sharing',
    REVEAL: 'Synthetic identity shared',
    WITHDRAW: 'Candidate withdrew; future identity access revoked',
  };
  state.audit.push({
    id: `event-${state.audit.length + 1}`,
    applicationId: application.id,
    type: action.type,
    at,
    description: descriptions[action.type] ?? action.type,
  });
  return state;
}

export function getRevealedIdentity(state: DemoState, applicationId: string): DemoIdentity | null {
  const application = state.applications.find((item) => item.id === applicationId);
  if (
    !application?.revealedAt ||
    application.withdrawnAt ||
    !application.authorizedAt ||
    !application.scorecard ||
    !application.interview?.completedAt
  )
    return null;
  const identities: Record<string, DemoIdentity> = {
    'candidate-a7f2': {
      displayName: 'Alex Morgan (fictional)',
      email: 'alex.morgan@example.test',
      phone: '+1 519 555 0101',
      resumeSummary:
        'Fictional mathematics student with customer service and peer tutoring experience.',
    },
    'candidate-k3m8': {
      displayName: 'Jordan Lee (fictional)',
      email: 'jordan.lee@example.test',
      phone: '+1 519 555 0102',
      resumeSummary: 'Fictional business student with retail and community-event experience.',
    },
    'candidate-r9c1': {
      displayName: 'Sam Rivera (fictional)',
      email: 'sam.rivera@example.test',
      phone: '+1 519 555 0103',
      resumeSummary: 'Fictional design student with teamwork and volunteer experience.',
    },
  };
  return identities[application.candidateId] ?? null;
}
