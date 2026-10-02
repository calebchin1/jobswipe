import { expect, it } from 'vitest';
import {
  ApproveProfileProposalSchema,
  CandidateProfileSchema,
  ProfileProposalSchema,
} from './live';
const content = {
  headline: 'Helpful teammate',
  educationLevel: 'Diploma',
  field: 'Business',
  studyStatus: 'Year 1',
  bullets: [],
  skills: ['Organization'],
};
it('keeps legacy profile reads compatible with explicit no-proposal state', () => {
  expect(
    CandidateProfileSchema.parse({
      draft: content,
      published: null,
      reviewStatus: 'pending_review',
      discoverable: false,
    }).proposal,
  ).toBeNull();
});
it('requires a positive immutable proposal revision and complete blind content', () => {
  expect(
    ProfileProposalSchema.safeParse({
      id: '70000000-0000-4000-8000-000000000007',
      draftRevision: 0,
      content,
    }).success,
  ).toBe(false);
  expect(
    ProfileProposalSchema.safeParse({
      id: '70000000-0000-4000-8000-000000000007',
      draftRevision: 1,
      content,
    }).success,
  ).toBe(true);
});
it('approval accepts only a proposal reference, never client-provided replacement content or eligibility', () => {
  const proposalId = '70000000-0000-4000-8000-000000000007';
  expect(ApproveProfileProposalSchema.parse({ proposalId })).toEqual({ proposalId });
  expect(
    ApproveProfileProposalSchema.safeParse({ proposalId, content, eligible: true }).success,
  ).toBe(false);
});
