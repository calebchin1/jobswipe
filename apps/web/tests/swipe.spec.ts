import { expect, test, type Page } from '@playwright/test';

// Pointer-driven swipe on the employer decks (mouse pointer events share the touch code path).
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

const second: LiveCandidateCard = {
  ...card,
  cardRef: '77777777-7777-4777-8777-777777777777',
  handle: 'Candidate K4P1',
  headline: 'Weekend barista who loves early shifts',
  applied: false,
};

async function installDeck(page: Page) {
  const calls: string[] = [];
  let deck = [card, second];
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    calls.push(`${route.request().method()} ${path}`);
    if (path.endsWith('/me')) return route.fulfill({ json: { account } });
    if (path.endsWith(`/employers/${ids.employer}/jobs`))
      return route.fulfill({ json: { jobs: [job] } });
    if (path.endsWith('/candidates')) return route.fulfill({ json: { candidates: deck } });
    if (path.endsWith('/applications')) return route.fulfill({ json: { applications: [] } });
    const pass = path.match(/\/candidates\/([0-9a-f-]+)\/pass(\/undo)?$/);
    if (pass) {
      deck = pass[2] ? [...deck] : deck.filter((item) => item.cardRef !== pass[1]);
      return route.fulfill({ json: { status: pass[2] ? 'restored' : 'passed' } });
    }
    if (path.endsWith('/interest')) return route.fulfill({ json: { applicationId: null } });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Unmocked' } },
    });
  });
  return calls;
}

async function drag(page: Page, dx: number, dy = 0) {
  const target = page.getByRole('group', { name: /swipe or press/i });
  await target.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  const box = (await target.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(80, box.height / 2);
  const steps = Array.from({ length: 8 }, (_, i) => ({
    x: x + (dx * (i + 1)) / 8,
    y: y + (dy * (i + 1)) / 8,
  }));
  if (test.info().project.name === 'mobile') {
    // Real touch input so the browser applies touch-action exactly as a phone would.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (const point of steps)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const point of steps) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

test('swipe left passes, undo restores, swipe right saves interest', async ({ page }) => {
  const calls = await installDeck(page);
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: card.handle })).toBeVisible();
  await expect(page.getByText('2 candidates left')).toBeVisible();

  await drag(page, -40);
  await expect(page.getByRole('heading', { name: card.handle })).toBeVisible();
  expect(calls.some((call) => call.includes('/pass'))).toBe(false);

  await drag(page, -220);
  await expect(page.getByRole('heading', { name: second.handle })).toBeVisible();
  expect(calls).toContain(`POST /api/v1/jobs/${ids.job}/candidates/${card.cardRef}/pass`);

  await page.getByRole('button', { name: 'Undo last pass' }).click();
  await expect(page.getByRole('heading', { name: card.handle })).toBeVisible();
  expect(calls).toContain(`POST /api/v1/jobs/${ids.job}/candidates/${card.cardRef}/pass/undo`);
  await expect(page.getByRole('button', { name: 'Undo last pass' })).toBeDisabled();

  await drag(page, 220);
  await expect(page.getByText(`Your interest in ${card.handle} is saved.`)).toBeVisible();
  await expect(page.getByRole('heading', { name: second.handle })).toBeVisible();

  await page.getByRole('group', { name: /swipe or press/i }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading', { name: 'You’re all caught up.' })).toBeVisible();
});

test('vertical drag scrolls instead of swiping', async ({ page }) => {
  const calls = await installDeck(page);
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: card.handle })).toBeVisible();
  await drag(page, 30, 200);
  await expect(page.getByRole('heading', { name: card.handle })).toBeVisible();
  expect(calls.some((call) => call.includes('/pass') || call.includes('/interest'))).toBe(false);
});

test('demo deck swipes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
  const first = await page.locator('.candidate-id').first().innerText();
  await drag(page, -220);
  await expect(page.locator('.candidate-id').first()).not.toHaveText(first);
});
