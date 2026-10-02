import { z } from 'zod';
export * from './live';
export * from './scheduling';

export const WeekdaySchema = z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
export const JobTypeSchema = z.enum(['Part-time', 'Summer', 'Internship', 'Full-time']);
export const JobSchema = z
  .object({
    id: z.string().min(1),
    employerId: z.string().min(1),
    company: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(20).max(5000),
    payMin: z.number().positive(),
    payMax: z.number().positive(),
    payPeriod: z.enum(['hour', 'year']),
    currency: z.literal('CAD'),
    location: z.string().trim().min(2).max(100),
    commuteMinutes: z.number().int().min(0).max(240),
    hoursPerWeek: z.number().int().min(1).max(60),
    schedule: z.array(WeekdaySchema).min(1),
    skills: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
    mustHaves: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
    niceToHaves: z.array(z.string().trim().min(1).max(160)).max(3),
    questions: z.array(z.string().trim().min(5).max(300)).min(3).max(5),
    isVacancy: z.boolean(),
    usesAiScreening: z.boolean(),
    status: z.enum(['draft', 'open', 'paused', 'closed']),
    jobType: JobTypeSchema,
    postedDaysAgo: z.number().int().nonnegative(),
  })
  .superRefine((job, ctx) => {
    if (job.payMax < job.payMin)
      ctx.addIssue({
        code: 'custom',
        path: ['payMax'],
        message: 'Maximum pay must be at least minimum pay.',
      });
    const annualSpread =
      (job.payMax - job.payMin) * (job.payPeriod === 'hour' ? job.hoursPerWeek * 52 : 1);
    // Voluntary platform rule for this slice; does not certify legal compliance.
    if (annualSpread > 50_000)
      ctx.addIssue({
        code: 'custom',
        path: ['payMax'],
        message: 'Use a pay range no wider than $50,000 in annual equivalent.',
      });
    const requirements = [...job.mustHaves, ...job.niceToHaves, job.description].join(' ');
    if (/canadian\s+(?:work\s+)?experience/i.test(requirements))
      ctx.addIssue({
        code: 'custom',
        path: ['mustHaves'],
        message: 'Remove Canadian-experience requirements.',
      });
  });
export type Job = z.infer<typeof JobSchema>;

export const BlindCandidateSchema = z
  .object({
    id: z.string(), // Synthetic demo identifier; production uses job-scoped card refs.
    handle: z.string(),
    headline: z.string().max(60),
    education: z.object({ level: z.string(), field: z.string(), status: z.string() }).strict(),
    bullets: z.array(z.string().max(140)).max(3),
    skills: z.array(z.string()).max(8),
    availability: z
      .object({ hoursPerWeek: z.number().min(0), days: z.array(WeekdaySchema) })
      .strict(),
    commuteMinutes: z.number().nonnegative(),
    experienceYears: z.number().nonnegative(),
    studentVerified: z.boolean(),
  })
  .strict();
export type BlindCandidate = z.infer<typeof BlindCandidateSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export const UuidSchema = z.uuid();
export const ScoreSchema = z.number().int().min(1).max(5);
export type ApplicationStage =
  | 'Applied'
  | 'Interested'
  | 'Matched'
  | 'Interview booked'
  | 'Interviewed'
  | 'Revealed'
  | 'Withdrawn';

export type DemoInterview = {
  startsAt: string;
  completedAt: string | null;
  candidateAttended: boolean;
  employerAttended: boolean;
};
export type DemoApplication = {
  id: string;
  jobId: string;
  candidateId: string;
  candidateInterested: boolean;
  employerInterested: boolean;
  interview: DemoInterview | null;
  scorecard: { scores: number[]; submittedAt: string } | null;
  authorizedAt: string | null;
  revealedAt: string | null;
  withdrawnAt: string | null;
};
export type DemoEvent = {
  id: string;
  applicationId: string;
  type: string;
  at: string;
  description: string;
};
export type DemoState = {
  jobs: Job[];
  candidates: BlindCandidate[];
  applications: DemoApplication[];
  selectedJobId: string;
  audit: DemoEvent[];
};

export type DemoAction =
  | { type: 'APPLIED'; jobId: string; candidateId: string; at?: string }
  | { type: 'EMPLOYER_INTEREST'; jobId: string; candidateId: string; at?: string }
  | { type: 'BOOK_INTERVIEW'; applicationId: string; startsAt: string; at?: string }
  | {
      type: 'COMPLETE_INTERVIEW';
      applicationId: string;
      candidateAttended: boolean;
      employerAttended: boolean;
      at?: string;
    }
  | { type: 'SUBMIT_SCORECARD'; applicationId: string; scores: number[]; at?: string }
  | { type: 'AUTHORIZE_REVEAL' | 'REVEAL' | 'WITHDRAW'; applicationId: string; at?: string }
  | { type: 'ADD_JOB'; job: Job }
  | { type: 'SELECT_JOB'; jobId: string }
  | { type: 'RESET' };

export type DemoIdentity = {
  displayName: string;
  email: string;
  phone: string;
  resumeSummary: string;
};
export * from './calls';
