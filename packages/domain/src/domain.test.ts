import { describe, expect, it } from 'vitest';
import { BlindCandidateSchema, JobSchema, type DemoAction, type DemoState } from '@swipe/contracts';
import {
  calculateFit,
  createDemoState,
  demoReducer,
  getApplicationStage,
  getRevealedIdentity,
  matchesJobPreferences,
} from './index';

const appId = 'application-coffee-a7f2';
const now = '2026-09-28T16:00:00.000Z';
const future = '2026-09-29T16:00:00.000Z';
const steps: DemoAction[] = [
  { type: 'EMPLOYER_INTEREST', jobId: 'job-coffee', candidateId: 'candidate-a7f2', at: now },
  { type: 'BOOK_INTERVIEW', applicationId: appId, startsAt: future, at: now },
  {
    type: 'COMPLETE_INTERVIEW',
    applicationId: appId,
    candidateAttended: true,
    employerAttended: true,
    at: future,
  },
  { type: 'SUBMIT_SCORECARD', applicationId: appId, scores: [4, 5, 3], at: future },
  { type: 'AUTHORIZE_REVEAL', applicationId: appId, at: future },
  { type: 'REVEAL', applicationId: appId, at: future },
];
const advance = (count: number): DemoState =>
  steps.slice(0, count).reduce(demoReducer, createDemoState());

describe('blind application lifecycle', () => {
  it('requires mutual interest to match', () => {
    const state = createDemoState();
    expect(getApplicationStage(state.applications[0]!)).toBe('Applied');
    expect(getApplicationStage(advance(1).applications[0]!)).toBe('Matched');
  });
  it('employer pre-interest never creates a match without an application', () => {
    const state = demoReducer(createDemoState(), {
      type: 'EMPLOYER_INTEREST',
      jobId: 'job-books',
      candidateId: 'candidate-r9c1',
    });
    const invite = state.applications.find((app) => app.jobId === 'job-books')!;
    expect(getApplicationStage(invite)).toBe('Interested');
    expect(() =>
      demoReducer(state, {
        type: 'BOOK_INTERVIEW',
        applicationId: invite.id,
        startsAt: future,
        at: now,
      }),
    ).toThrow('Both sides');
  });
  it.each([0, 1, 2, 3, 4])('rejects reveal at incomplete step %i', (count) => {
    const state = advance(count);
    expect(getRevealedIdentity(state, appId)).toBeNull();
    expect(() => demoReducer(state, { type: 'REVEAL', applicationId: appId })).toThrow();
  });
  it('allows only the completed and authorized demo reveal', () => {
    const state = advance(6);
    expect(getApplicationStage(state.applications[0]!)).toBe('Revealed');
    expect(getRevealedIdentity(state, appId)?.email).toBe('alex.morgan@example.test');
    expect(getRevealedIdentity(state, 'application-coffee-k3m8')).toBeNull();
    const serialized = JSON.stringify(getRevealedIdentity(state, appId));
    expect(serialized).not.toMatch(/dateOfBirth|postalCode|schoolName|age/);
  });
  it.each([0, 1, 2, 3, 4, 5, 6])('withdrawal at step %i blocks further sharing', (count) => {
    const state = demoReducer(advance(count), { type: 'WITHDRAW', applicationId: appId });
    expect(getApplicationStage(state.applications[0]!)).toBe('Withdrawn');
    expect(getRevealedIdentity(state, appId)).toBeNull();
    expect(() => demoReducer(state, { type: 'REVEAL', applicationId: appId })).toThrow();
    expect(() => demoReducer(state, steps[0]!)).toThrow('withdrawn');
  });
  it('locks submitted scores', () => {
    expect(() =>
      demoReducer(advance(4), {
        type: 'SUBMIT_SCORECARD',
        applicationId: appId,
        scores: [5, 5, 5],
      }),
    ).toThrow('cannot be changed');
  });
  it.each([
    [0, 3, 4],
    [6, 3, 4],
    [2.5, 3, 4],
    [4, 5],
    [4, 5, 3, 2],
    [NaN, 4, 4],
  ])('rejects invalid scores %j', (...scores) => {
    expect(() =>
      demoReducer(advance(3), { type: 'SUBMIT_SCORECARD', applicationId: appId, scores }),
    ).toThrow('Score every question');
  });
  it('requires both attendees', () => {
    expect(() =>
      demoReducer(advance(2), {
        type: 'COMPLETE_INTERVIEW',
        applicationId: appId,
        candidateAttended: false,
        employerAttended: true,
      }),
    ).toThrow('Both participants');
  });
  it('rejects past booking and malformed timestamp', () => {
    expect(() =>
      demoReducer(advance(1), {
        type: 'BOOK_INTERVIEW',
        applicationId: appId,
        startsAt: now,
        at: future,
      }),
    ).toThrow('future');
    expect(() =>
      demoReducer(advance(1), { type: 'WITHDRAW', applicationId: appId, at: 'invalid' }),
    ).toThrow('valid timestamp');
  });
  it('makes duplicate interest and reveal idempotent', () => {
    const matched = advance(1);
    expect(demoReducer(matched, steps[0]!)).toBe(matched);
    const revealed = advance(6);
    expect(demoReducer(revealed, steps[5]!)).toBe(revealed);
  });
  it('never mutates prior state or reuses fixture arrays', () => {
    const initial = createDemoState();
    const snapshot = JSON.stringify(initial);
    demoReducer(initial, steps[0]!);
    expect(JSON.stringify(initial)).toBe(snapshot);
    initial.jobs[0]!.title = 'Changed';
    expect(createDemoState().jobs[0]!.title).not.toBe('Changed');
  });
});

describe('input boundaries and explainable ranking', () => {
  it('rejects private fields on a blind card', () => {
    expect(
      BlindCandidateSchema.safeParse({ ...createDemoState().candidates[0], legalName: 'Leak' })
        .success,
    ).toBe(false);
  });
  it('validates ordered and bounded pay ranges with explicit periods', () => {
    const job = createDemoState().jobs[0]!;
    expect(JobSchema.safeParse({ ...job, payMax: 17 }).success).toBe(false);
    expect(JobSchema.safeParse({ ...job, payMax: 1000 }).success).toBe(false);
    expect(
      JobSchema.safeParse({ ...job, payPeriod: 'year', payMin: 45000, payMax: 65000 }).success,
    ).toBe(true);
  });
  it('rejects Canadian-experience requirements', () => {
    expect(
      JobSchema.safeParse({ ...createDemoState().jobs[0], mustHaves: ['Canadian work experience'] })
        .success,
    ).toBe(false);
  });
  it('matches tags case-insensitively and produces bounded scores', () => {
    const state = createDemoState();
    const candidate = state.candidates[0]!;
    const job = state.jobs[0]!;
    const fit = calculateFit(candidate, job);
    expect(fit.components.skills).toBe(1);
    expect(fit.score).toBeGreaterThan(0);
    expect(fit.score).toBeLessThanOrEqual(100);
    expect(
      calculateFit(
        { ...candidate, skills: candidate.skills.map((skill) => skill.toUpperCase()) },
        job,
      ),
    ).toEqual(fit);
  });
  it('filters closed jobs and never treats annual pay as hourly', () => {
    const job = createDemoState().jobs[0]!;
    expect(matchesJobPreferences({ ...job, status: 'closed' }, {})).toBe(false);
    expect(
      matchesJobPreferences({ ...job, payPeriod: 'year', payMin: 45000 }, { payFloor: 20 }),
    ).toBe(false);
    expect(matchesJobPreferences(job, { maxCommuteMinutes: 10 })).toBe(false);
  });
});
