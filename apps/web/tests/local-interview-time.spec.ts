import { expect, test } from '@playwright/test';
import { localInterviewTime } from '../src/lib/local-interview-time';

function toronto<T>(run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Toronto';
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test('local scheduling rejects nonexistent and ambiguous Toronto daylight-saving times', () => {
  toronto(() => {
    expect(() => localInterviewTime('2027-03-14T02:30', 0)).toThrow('does not exist');
    expect(() => localInterviewTime('2027-11-07T01:30', 0)).toThrow('occurs twice');
    expect(localInterviewTime('2027-03-14T03:30', 0).toISOString()).toBe(
      '2027-03-14T07:30:00.000Z',
    );
  });
});

test('local scheduling rejects past, malformed, and invalid calendar dates', () => {
  toronto(() => {
    expect(() =>
      localInterviewTime('2027-01-12T10:00', Date.parse('2027-01-13T12:00:00Z')),
    ).toThrow('future');
    expect(() => localInterviewTime('next Thursday', 0)).toThrow('complete');
    expect(() => localInterviewTime('2027-02-30T10:00', 0)).toThrow('does not exist');
  });
});
