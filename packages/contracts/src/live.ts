import { z } from 'zod';

export const AccountRoleSchema = z.enum(['candidate', 'employer']);
export const ProfileReviewSchema = z.enum([
  'not_started',
  'pending_review',
  'awaiting_approval',
  'approved',
]);
export const EmployerContextSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  website: z.string().nullable(),
  role: z.enum(['owner', 'recruiter', 'viewer']),
  verificationStatus: z.enum(['pending', 'verified', 'suspended']),
});
export const AccountContextSchema = z.object({
  accountId: z.uuid(),
  status: z.enum(['active', 'suspended', 'closed']),
  roles: z.array(AccountRoleSchema),
  employers: z.array(EmployerContextSchema),
  candidate: z.object({ reviewStatus: ProfileReviewSchema, discoverable: z.boolean() }).nullable(),
});
export type AccountContext = z.infer<typeof AccountContextSchema>;
export type EmployerContext = z.infer<typeof EmployerContextSchema>;

export const ProfileDraftSchema = z
  .object({
    headline: z.string().trim().min(1).max(60),
    educationLevel: z.string().trim().min(1).max(80),
    field: z.string().trim().min(1).max(80),
    studyStatus: z.string().trim().min(1).max(40),
    bullets: z.array(z.string().trim().min(1).max(140)).max(3),
    skills: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
  })
  .strict();
export const ProfileProposalSchema = z
  .object({
    id: z.uuid(),
    draftRevision: z.number().int().positive(),
    content: ProfileDraftSchema,
  })
  .strict();
export const ApproveProfileProposalSchema = z.object({ proposalId: z.uuid() }).strict();
export type ProfileProposal = z.infer<typeof ProfileProposalSchema>;
export const CandidateProfileSchema = z.object({
  draft: ProfileDraftSchema.nullable(),
  proposal: ProfileProposalSchema.nullable().default(null),
  published: ProfileDraftSchema.nullable(),
  reviewStatus: ProfileReviewSchema,
  discoverable: z.boolean(),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type ProfileDraft = z.infer<typeof ProfileDraftSchema>;

export const WorkplaceTypeSchema = z.enum([
  'office',
  'retail',
  'restaurant_service',
  'restaurant_kitchen',
  'warehouse',
  'construction',
]);
export const workplaceMinimumAge = {
  office: 14,
  retail: 14,
  restaurant_service: 14,
  restaurant_kitchen: 15,
  warehouse: 15,
  construction: 16,
} as const;
export const LiveJobDraftSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().min(20).max(5000),
    payMinMinor: z.number().int().positive(),
    payMaxMinor: z.number().int().positive(),
    payPeriod: z.enum(['hour', 'year']),
    currency: z.literal('CAD'),
    location: z.string().trim().min(2).max(100),
    hoursPerWeek: z.number().int().min(1).max(60),
    schedule: z
      .array(z.enum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']))
      .min(1)
      .max(7),
    skills: z.array(z.string().trim().min(1).max(60)).min(1).max(8),
    mustHaves: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
    niceToHaves: z.array(z.string().trim().min(1).max(160)).max(3),
    questions: z.array(z.string().trim().min(5).max(300)).min(3).max(5),
    isVacancy: z.boolean(),
    usesAiScreening: z.boolean(),
    workplaceType: WorkplaceTypeSchema,
    minimumAge: z.union([z.literal(14), z.literal(15), z.literal(16), z.literal(18)]).optional(),
    jobType: z.enum(['Part-time', 'Summer', 'Internship', 'Full-time']),
  })
  .strict()
  .superRefine((job, ctx) => {
    if (job.payMaxMinor < job.payMinMinor)
      ctx.addIssue({
        code: 'custom',
        path: ['payMaxMinor'],
        message: 'Maximum pay must be at least minimum pay.',
      });
    const spread =
      (job.payMaxMinor - job.payMinMinor) * (job.payPeriod === 'hour' ? job.hoursPerWeek * 52 : 1);
    if (spread > 5_000_000)
      ctx.addIssue({
        code: 'custom',
        path: ['payMaxMinor'],
        message: 'Use a range no wider than $50,000 in annual equivalent.',
      });
    if (
      /canadian\s+(?:work\s+)?experience/i.test(
        [
          job.title,
          job.description,
          ...job.mustHaves,
          ...job.niceToHaves,
          ...job.skills,
          ...job.questions,
        ].join(' '),
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['mustHaves'],
        message: 'Remove Canadian-experience requirements.',
      });
    }
    if (job.minimumAge !== undefined && job.minimumAge !== workplaceMinimumAge[job.workplaceType])
      ctx.addIssue({
        code: 'custom',
        path: ['minimumAge'],
        message: 'Eligibility is determined from the workplace type.',
      });
  });
export type LiveJobDraft = z.infer<typeof LiveJobDraftSchema>;
// Response validation accepts older published fixtures without weakening new-write validation.
export const LiveJobDetailsSchema = z.object({
  title: z.string(),
  description: z.string(),
  payMinMinor: z.number().int(),
  payMaxMinor: z.number().int(),
  payPeriod: z.enum(['hour', 'year']),
  currency: z.literal('CAD'),
  location: z.string(),
  hoursPerWeek: z.number(),
  schedule: z.array(z.string()),
  skills: z.array(z.string()),
  mustHaves: z.array(z.string()),
  niceToHaves: z.array(z.string()),
  questions: z.array(z.string()),
  isVacancy: z.boolean(),
  usesAiScreening: z.boolean(),
  workplaceType: WorkplaceTypeSchema,
  minimumAge: z.number().int(),
  jobType: z.string(),
});
export const LiveJobSchema = z.object({
  id: z.uuid(),
  employerId: z.uuid(),
  company: z.string(),
  status: z.enum(['draft', 'open', 'paused', 'closed']),
  versionId: z.uuid().nullable(),
  details: LiveJobDetailsSchema.nullable(),
  hasUnpublishedChanges: z.boolean(),
  canApply: z.boolean().optional(),
});
export type LiveJob = z.infer<typeof LiveJobSchema>;

export const LiveApplicationSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  jobTitle: z.string(),
  company: z.string(),
  stage: z.enum(['Applied', 'Matched', 'Interview booked', 'Interviewed', 'Revealed', 'Withdrawn']),
  appliedAt: z.string(),
  matchedAt: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  cardId: z.uuid().nullable().optional(),
  handle: z.string().optional(),
  headline: z.string().nullable().optional(),
});
export type LiveApplication = z.infer<typeof LiveApplicationSchema>;
export const LiveCandidateCardSchema = z.object({
  cardRef: z.uuid(),
  handle: z.string(),
  headline: z.string(),
  education: z.object({ level: z.string(), field: z.string(), status: z.string() }),
  bullets: z.array(z.string()),
  skills: z.array(z.string()),
  applied: z.boolean(),
});
export type LiveCandidateCard = z.infer<typeof LiveCandidateCardSchema>;

export const SignInSchema = z
  .object({ email: z.email().max(254), password: z.string().min(1).max(200) })
  .strict();
export const SignUpSchema = SignInSchema.extend({
  password: z.string().min(12).max(200),
  role: AccountRoleSchema,
}).strict();
export const EmployerInputSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    website: z
      .url()
      .max(500)
      .refine(
        (value) => ['https:', 'http:'].includes(new URL(value).protocol),
        'Use a website URL.',
      ),
  })
  .strict();
