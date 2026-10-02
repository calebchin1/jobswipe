import { describe, expect, it } from 'vitest';
import {
  BookInterviewSchema,
  CreateInterviewSlotSchema,
  InterviewInstantSchema,
  InterviewTimeZoneSchema,
} from './scheduling';
describe('interview scheduling contracts', () => {
  const slot = {
    startsAt: '2027-01-15T09:00:00-05:00',
    endsAt: '2027-01-15T09:30:00-05:00',
    timeZone: 'America/Toronto',
  };
  it('canonicalizes offset-qualified instants to UTC', () => {
    expect(CreateInterviewSlotSchema.parse(slot)).toMatchObject({
      startsAt: '2027-01-15T14:00:00.000Z',
      endsAt: '2027-01-15T14:30:00.000Z',
    });
  });
  it('rejects ambiguous local timestamps without an offset', () => {
    expect(InterviewInstantSchema.safeParse('2026-11-01T01:30:00').success).toBe(false);
  });
  it('keeps the two fall-back occurrences distinct', () => {
    expect(InterviewInstantSchema.parse('2026-11-01T01:30:00-04:00')).not.toBe(
      InterviewInstantSchema.parse('2026-11-01T01:30:00-05:00'),
    );
  });
  it('rejects invalid time zones and impossible dates', () => {
    expect(InterviewTimeZoneSchema.safeParse('Canada/Fictional').success).toBe(false);
    expect(InterviewInstantSchema.safeParse('2027-02-30T12:00:00Z').success).toBe(false);
  });
  it.each([5, 90, -30])('rejects unsupported duration %s', (minutes) => {
    expect(
      CreateInterviewSlotSchema.safeParse({
        ...slot,
        startsAt: '2027-01-15T14:00:00Z',
        endsAt: new Date(Date.parse('2027-01-15T14:00:00Z') + minutes * 60_000).toISOString(),
      }).success,
    ).toBe(false);
  });
  it('does not accept candidate-selected actor or completion fields', () => {
    expect(
      BookInterviewSchema.safeParse({
        slotId: '10000000-0000-4000-8000-000000000001',
        candidateId: 'attacker',
        completed: true,
      }).success,
    ).toBe(false);
  });
});
