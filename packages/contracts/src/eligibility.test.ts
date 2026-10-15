import { describe, expect, it } from 'vitest';
import { AdultPilotAttestationSchema, CandidateEligibilitySchema } from './eligibility';

describe('private adult pilot contracts', () => {
  it('accepts explicit declarations and removal without accepting client identity or expiry', () => {
    const input = { adult: true, authorizedToWork: true, policyVersion: 'adult-pilot-v1' };
    expect(AdultPilotAttestationSchema.parse(input)).toEqual(input);
    expect(AdultPilotAttestationSchema.parse({ ...input, adult: false }).adult).toBe(false);
    for (const extra of [
      { candidateId: 'other' },
      { minimumAgeBand: 18 },
      { refreshDueAt: '2099-01-01' },
    ])
      expect(AdultPilotAttestationSchema.safeParse({ ...input, ...extra }).success).toBe(false);
    expect(AdultPilotAttestationSchema.safeParse({ ...input, policyVersion: 'old' }).success).toBe(
      false,
    );
    expect(AdultPilotAttestationSchema.safeParse({ ...input, adult: 'true' }).success).toBe(false);
  });
  it('limits the candidate response to status and policy timestamps', () => {
    const status = {
      status: 'not_started',
      policyVersion: 'adult-pilot-v1',
      attestedAt: null,
      refreshDueAt: null,
    };
    expect(CandidateEligibilitySchema.parse(status)).toEqual(status);
    expect(
      CandidateEligibilitySchema.safeParse({ ...status, dateOfBirth: '2000-01-01' }).success,
    ).toBe(false);
  });
});
