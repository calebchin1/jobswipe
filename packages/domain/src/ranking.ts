import type { BlindCandidate, Job } from '@swipe/contracts';

export type FitResult = {
  score: number;
  reasons: string[];
  components: { skills: number; availability: number; commute: number; freshness: number };
};
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const normalized = (value: string) => value.trim().toLocaleLowerCase('en-CA');

/** Safe structured inputs only: no name, school, age, location coordinates or resume. */
export function calculateFit(candidate: BlindCandidate, job: Job): FitResult {
  const candidateSkills = new Set(candidate.skills.map(normalized));
  const desiredSkills = [...new Set(job.skills.map(normalized))];
  const overlap = desiredSkills.filter((skill) => candidateSkills.has(skill)).length;
  const skills = desiredSkills.length ? overlap / desiredSkills.length : 0.5;
  const schedule = [...new Set(job.schedule)];
  const days = schedule.length
    ? schedule.filter((day) => candidate.availability.days.includes(day)).length / schedule.length
    : 0.5;
  const hours =
    job.hoursPerWeek > 0 ? clamp(candidate.availability.hoursPerWeek / job.hoursPerWeek) : 0.5;
  const availability = (days + hours) / 2;
  const commute = clamp(1 - candidate.commuteMinutes / 60);
  const freshness = clamp(1 - job.postedDaysAgo / 30);
  const score = Math.round(
    100 * (skills * 0.5 + availability * 0.2 + commute * 0.15 + freshness * 0.15),
  );
  return {
    score,
    components: { skills, availability, commute, freshness },
    reasons: [
      `${overlap} of ${desiredSkills.length} relevant skills`,
      `${candidate.availability.hoursPerWeek} hours available each week`,
      `About ${candidate.commuteMinutes} minutes away (demo estimate)`,
    ],
  };
}

/** Convenience filtering for synthetic cards, NOT a legal eligibility evaluator. */
export function matchesJobPreferences(
  job: Job,
  preferences: { payFloor?: number; maxCommuteMinutes?: number; jobTypes?: string[] },
): boolean {
  return (
    job.status === 'open' &&
    (preferences.payFloor === undefined ||
      (job.payPeriod === 'hour' && job.payMin >= preferences.payFloor)) &&
    (preferences.maxCommuteMinutes === undefined ||
      job.commuteMinutes <= preferences.maxCommuteMinutes) &&
    (!preferences.jobTypes?.length || preferences.jobTypes.includes(job.jobType))
  );
}
