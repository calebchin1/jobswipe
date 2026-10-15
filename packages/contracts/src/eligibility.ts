import { z } from 'zod';

export const AdultPilotAttestationSchema = z
  .object({
    adult: z.boolean(),
    authorizedToWork: z.boolean(),
    policyVersion: z.literal('adult-pilot-v1'),
  })
  .strict();
export const CandidateEligibilitySchema = z
  .object({
    policyVersion: z.literal('adult-pilot-v1'),
    status: z.enum(['not_started', 'eligible', 'not_eligible', 'expired']),
    attestedAt: z.iso.datetime({ offset: true }).nullable(),
    refreshDueAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();
export type CandidateEligibility = z.infer<typeof CandidateEligibilitySchema>;
