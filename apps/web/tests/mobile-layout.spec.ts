import { expect, test, type Page } from '@playwright/test';

// Phone floors: no sideways scroll, 16px form fields (no iOS focus zoom), 44px tap targets.
import type { AccountContext, LiveApplication, LiveJob, LiveCandidateCard } from '@swipe/contracts';

const ids = {
  account: '11111111-1111-4111-8111-111111111111',
  employer: '22222222-2222-4222-8222-222222222222',
  job: '33333333-3333-4333-8333-333333333333',
  version: '44444444-4444-4444-8444-444444444444',
  card: '55555555-5555-4555-8555-555555555555',
  application: '66666666-6666-4666-8666-666666666666',
};
const account: AccountContext = {
  accountId: ids.account,
  status: 'active',
  roles: ['employer'],
  employers: [
    {
      id: ids.employer,
      name: 'Example Coffee',
      website: 'https://example.test',
      role: 'owner',
      verificationStatus: 'verified',
    },
  ],
  candidate: null,
};
const job: LiveJob = {
  id: ids.job,
  employerId: ids.employer,
  company: 'Example Coffee',
  status: 'open',
  versionId: ids.version,
  hasUnpublishedChanges: false,
  details: {
    title: 'Weekend café teammate',
    description: 'Help customers feel welcome at our neighbourhood café.',
    payMinMinor: 1800,
    payMaxMinor: 2200,
    payPeriod: 'hour',
    currency: 'CAD',
    location: 'Waterloo',
    hoursPerWeek: 16,
    schedule: ['Sat', 'Sun'],
    skills: ['Teamwork', 'Customer service'],
    mustHaves: ['Enjoy helping customers'],
    niceToHaves: [],
    questions: [
      'Tell us about a time you helped someone.',
      'How do you prioritize competing requests?',
      'How do you learn a new skill?',
    ],
    isVacancy: true,
    usesAiScreening: false,
    workplaceType: 'restaurant_service',
    minimumAge: 14,
    jobType: 'Part-time',
  },
};
const card: LiveCandidateCard = {
  cardRef: ids.card,
  handle: 'Candidate G2M8',
  headline: 'Reliable teammate with customer service experience',
  education: { level: 'Diploma', field: 'Business', status: 'Year 1' },
  bullets: ['Helped customers at a community market.'],
  skills: ['Teamwork', 'Customer service'],
  applied: true,
};
const application: LiveApplication = {
  id: ids.application,
  jobId: ids.job,
  jobTitle: job.details!.title,
  company: job.company,
  stage: 'Applied',
  appliedAt: '2026-09-28T14:00:00Z',
  matchedAt: null,
  withdrawnAt: null,
  cardId: ids.card,
  handle: card.handle,
  headline: card.headline,
};

async function installWorkspace(
  page: Page,
  options: { pending?: boolean; expired?: boolean; paused?: boolean } = {},
) {
  let matched = false;
  const routes: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    routes.push(path);
    if (path.endsWith('/me')) {
      if (options.expired)
        return route.fulfill({
          status: 401,
          json: {
            error: { code: 'UNAUTHENTICATED', message: 'Your session has expired. Sign in again.' },
          },
        });
      return route.fulfill({
        json: {
          account: {
            ...account,
            employers: account.employers.map((employer) => ({
              ...employer,
              verificationStatus: options.pending ? 'pending' : 'verified',
            })),
          },
        },
      });
    }
    if (path.endsWith(`/employers/${ids.employer}/jobs`))
      return route.fulfill({
        json: {
          jobs: [
            {
              ...job,
              status: options.pending ? 'draft' : options.paused ? 'paused' : 'open',
              versionId: options.pending ? null : job.versionId,
            },
          ],
        },
      });
    if (path.endsWith('/candidates')) return route.fulfill({ json: { candidates: [card] } });
    if (path.endsWith('/applications'))
      return route.fulfill({
        json: {
          applications: [
            {
              ...application,
              stage: matched ? 'Matched' : 'Applied',
              matchedAt: matched ? '2026-09-29T14:00:00Z' : null,
            },
          ],
        },
      });
    if (path.endsWith('/interest')) {
      expect(route.request().postDataJSON()).toEqual({ cardId: ids.card });
      matched = true;
      return route.fulfill({ json: { applicationId: ids.application } });
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Unmocked test request' } },
    });
  });
  return routes;
}

async function phoneViolations(page: Page) {
  await page.waitForLoadState('networkidle');
  return page.evaluate(() => {
    const doc = document.documentElement;
    const issues: string[] = [];
    if (doc.scrollWidth > doc.clientWidth)
      issues.push(`page scrolls sideways (${doc.scrollWidth}px)`);
    const describe = (e: Element) =>
      `${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || e.id).trim().slice(0, 30)}"`;
    for (const e of Array.from(
      document.querySelectorAll('a,button,input,select,textarea,[role=tab]'),
    )) {
      const box = e.getBoundingClientRect();
      const style = getComputedStyle(e);
      if (!box.width || style.visibility === 'hidden' || box.bottom < 0) continue;
      if (
        e.matches('input:not([type=checkbox]):not([type=radio]),select,textarea') &&
        parseFloat(style.fontSize) < 16
      )
        issues.push(`${describe(e)} font ${style.fontSize}`);
      // Checkboxes/radios are measured by their label; inline links inside prose are exempt.
      const target = e.matches('input[type=checkbox],input[type=radio]') ? e.closest('label') : e;
      if (!target || (e.matches('a') && style.display === 'inline')) continue;
      const area = target.getBoundingClientRect();
      if (area.height < 44 || area.width < 44)
        issues.push(`${describe(e)} ${Math.round(area.width)}x${Math.round(area.height)}`);
    }
    return issues;
  });
}

for (const width of [320, 390]) {
  test.describe(`${width}px phone`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });

    test('public pages meet touch floors', async ({ page }) => {
      for (const path of ['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password']) {
        await page.goto(path);
        expect(await phoneViolations(page), path).toEqual([]);
      }
    });

    test('every workspace tab meets touch floors', async ({ page }) => {
      await installWorkspace(page);
      await page.goto('/workspace');
      await expect(
        page.getByRole('heading', { name: 'Example Coffee', exact: true }),
      ).toBeVisible();
      for (const tab of await page.getByRole('tab').all()) {
        await tab.click();
        expect(await phoneViolations(page), (await tab.textContent()) ?? 'tab').toEqual([]);
      }
    });
  });
}
