import { expect, test, type Page } from '@playwright/test';
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

test('sign-in sends credentials only to the same-origin BFF and stores no browser tokens', async ({
  page,
}) => {
  let submitted: unknown;
  await installWorkspace(page);
  await page.route('**/api/v1/auth/sign-in', async (route) => {
    submitted = route.request().postDataJSON();
    expect(new URL(route.request().url()).origin).toBe('http://127.0.0.1:3110');
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ json: { status: 'signed_in' } });
  });
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill('hiring@example.test');
  await page.getByLabel(/^Password/).fill('fictional-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Example Coffee', exact: true })).toBeVisible();
  expect(submitted).toEqual({ email: 'hiring@example.test', password: 'fictional-password' });
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test('signup validates confirmation and explains email verification', async ({ page }) => {
  let count = 0;
  await page.route('**/api/v1/auth/sign-up', async (route) => {
    count++;
    expect(route.request().postDataJSON().role).toBe('employer');
    await route.fulfill({ json: { status: 'check_email' } });
  });
  await page.goto('/sign-up');
  await page.getByLabel('Work email').fill('hiring@example.test');
  await page.getByLabel(/^Password/).fill('fictional-password');
  await page.getByLabel('Confirm password').fill('different-password');
  await page.getByRole('button', { name: 'Create employer account' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('don’t match');
  expect(count).toBe(0);
  await page.getByLabel('Confirm password').fill('fictional-password');
  await page.getByRole('button', { name: 'Create employer account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  expect(count).toBe(1);
});

test('pending company can inspect draft but never requests candidate data', async ({ page }) => {
  const requests = await installWorkspace(page, { pending: true });
  await page.goto('/workspace');
  await expect(page.getByText('Company verification is pending.')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your shortlist comes after verification.' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Job details' }).click();
  await expect(page.getByRole('button', { name: 'Publish job', exact: true })).toBeDisabled();
  expect(requests.some((path) => path.endsWith('/candidates'))).toBe(false);
  expect(requests.some((path) => path.endsWith('/applications'))).toBe(false);
  await expect(page.getByText(card.handle, { exact: true })).toHaveCount(0);
});

test('actual interest response updates pipeline without any simulated reveal controls', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installWorkspace(page);
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: card.handle })).toBeVisible();
  await page.getByRole('button', { name: 'I’m interested', exact: true }).click();
  await expect(page.getByText(`You matched with ${card.handle}.`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You’re all caught up.' })).toBeVisible();
  await page.getByRole('tab', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Matched/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /simulate|reveal/i })).toHaveCount(0);
  await expect(page.getByText(/A match does not unlock identity/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('live-workspace.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('paused jobs retain applications without fetching a candidate deck', async ({ page }) => {
  const requests = await installWorkspace(page, { paused: true });
  await page.goto('/workspace');
  await page.getByRole('tab', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('cell', { name: /Applied/ }).last()).toBeVisible();
  expect(requests.some((path) => path.endsWith('/candidates'))).toBe(false);
  expect(requests.some((path) => path.endsWith('/applications'))).toBe(true);
});

test('expired session exposes no candidate details', async ({ page }) => {
  await installWorkspace(page, { expired: true });
  await page.goto('/workspace');
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText(card.handle, { exact: true })).toHaveCount(0);
});

test('draft edits validate annual-equivalent pay and Canadian experience before writing', async ({
  page,
}) => {
  const requests = await installWorkspace(page);
  let writes = 0;
  await page.route(`**/api/v1/employers/${ids.employer}/jobs`, async (route) => {
    if (route.request().method() === 'POST') {
      writes++;
      return route.fulfill({ json: { jobId: ids.job } });
    }
    return route.fallback();
  });
  await page.goto('/workspace');
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByLabel('Maximum pay · CAD / hour').fill('100');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('annual equivalent');
  await page.getByLabel('Maximum pay · CAD / hour').fill('22');
  await page.getByLabel('Job title', { exact: true }).fill('Canadian work experience needed');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Canadian-experience');
  expect(writes).toBe(0);
  expect(requests.length).toBeGreaterThan(0);
});

test('dated interview slots persist server responses and protect teammate availability', async ({
  page,
}, testInfo) => {
  await installWorkspace(page);
  const ownedId = '77777777-7777-4777-8777-777777777777';
  const teamId = '88888888-8888-4888-8888-888888888888';
  const createdId = '99999999-9999-4999-8999-999999999999';
  let slots = [
    {
      id: ownedId,
      jobId: ids.job,
      startsAt: '2099-10-14T14:00:00.000Z',
      endsAt: '2099-10-14T14:15:00.000Z',
      timeZone: 'America/Toronto',
      status: 'available',
      ownedByMe: true,
    },
    {
      id: teamId,
      jobId: ids.job,
      startsAt: '2099-10-14T15:00:00.000Z',
      endsAt: '2099-10-14T15:15:00.000Z',
      timeZone: 'America/Toronto',
      status: 'available',
      ownedByMe: false,
    },
  ];
  let submitted: { startsAt: string; endsAt: string; timeZone: string } | undefined;
  await page.route(`**/api/v1/jobs/${ids.job}/interview-slots`, async (route) => {
    if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      const created = { ...slots[0], ...submitted!, id: createdId };
      slots.push(created);
      return route.fulfill({ json: { slot: created } });
    }
    return route.fulfill({ json: { slots } });
  });
  await page.route(`**/api/v1/jobs/${ids.job}/interviews`, (route) =>
    route.fulfill({ json: { interviews: [] } }),
  );
  await page.route(`**/api/v1/interview-slots/${ownedId}/cancel`, async (route) => {
    const slot = { ...slots.find((item) => item.id === ownedId)!, status: 'cancelled' };
    slots = slots.map((item) => (item.id === ownedId ? slot : item));
    return route.fulfill({ json: { slot } });
  });
  await page.goto('/workspace');
  await page.getByRole('tab', { name: 'Interviews', exact: true }).click();
  await expect(page.getByText('All times shown in', { exact: false })).toBeVisible();
  // Only the current recruiter’s slot exposes a remove control.
  await expect(page.getByRole('button', { name: /^Remove slot/ })).toHaveCount(1);
  await page.getByLabel('Interview date and start time').fill('2030-10-14T10:00');
  await page.getByRole('combobox', { name: 'Duration', exact: true }).selectOption('30');
  await page.getByRole('button', { name: 'Add available time' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Interview time added' })).toBeVisible();
  expect(submitted?.startsAt).toMatch(/Z$/);
  expect(Date.parse(submitted!.endsAt) - Date.parse(submitted!.startsAt)).toBe(30 * 60_000);
  expect(submitted?.timeZone).toBeTruthy();
  await expect(page.getByRole('button', { name: /^Remove slot/ })).toHaveCount(2);
  await page.getByRole('button', { name: /^Remove slot.*2099/ }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'removed from candidate availability' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Remove slot/ })).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: /complete|attendance|reveal|join call/i }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('interview-scheduling.png'), fullPage: true });
});

test('booked interview cancellation is explicit and does not invent completion', async ({
  page,
}) => {
  await installWorkspace(page);
  const interviewId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let interview = {
    id: interviewId,
    applicationId: ids.application,
    jobId: ids.job,
    jobTitle: job.details!.title,
    company: job.company,
    slotId: null,
    startsAt: '2099-10-14T14:00:00.000Z',
    endsAt: '2099-10-14T14:15:00.000Z',
    timeZone: 'America/Toronto',
    status: 'scheduled',
    round: 1,
  };
  let cancellations = 0;
  await page.route(
    `**/api/v1/applications/${ids.application}/interviews/${interviewId}/calendar`,
    (route) =>
      route.fulfill({
        contentType: 'text/calendar; charset=utf-8',
        body: 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Blind audio interview\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',
      }),
  );
  await page.route(`**/api/v1/jobs/${ids.job}/interview-slots`, (route) =>
    route.fulfill({ json: { slots: [] } }),
  );
  await page.route(`**/api/v1/jobs/${ids.job}/interviews`, (route) =>
    route.fulfill({ json: { interviews: [interview] } }),
  );
  await page.route(`**/api/v1/interviews/${interviewId}/cancel`, async (route) => {
    cancellations++;
    expect(route.request().postDataJSON()).toEqual({ reason: 'Interviewer unavailable' });
    interview = { ...interview, status: 'cancelled' };
    return route.fulfill({ json: { interview } });
  });
  await page.goto('/workspace');
  await page.getByRole('tab', { name: 'Interviews', exact: true }).click();
  await expect(
    page.getByText('Calendar downloads are static copies.', { exact: false }),
  ).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download calendar' }).click();
  expect((await downloaded).suggestedFilename()).toBe('interview.ics');
  await page.getByRole('button', { name: 'Cancel interview', exact: true }).click();
  expect(cancellations).toBe(0);
  await expect(page.getByRole('heading', { name: 'Cancel this interview?' })).toBeVisible();
  await page.getByLabel('Reason · optional').fill('Interviewer unavailable');
  await page.getByRole('button', { name: 'Confirm cancellation', exact: true }).click();
  await expect(
    page.getByText('The interview booking has been cancelled.', { exact: false }),
  ).toBeVisible();
  expect(cancellations).toBe(1);
  await expect(page.getByRole('button', { name: 'Cancel interview', exact: true })).toHaveCount(0);
  await expect(page.getByText('No upcoming interviews.')).toBeVisible();
  await page.getByRole('button', { name: 'Show past and cancelled interviews (1)' }).click();
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible();
});

test('password reset request is non-enumerating and confirmation failures are visible', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/password-reset', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ email: 'fictional@example.test' });
    return route.fulfill({ json: { status: 'check_email' } });
  });
  await page.goto('/sign-in?error=confirmation');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('invalid or expired');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await page.getByLabel('Account email').fill('fictional@example.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox.' })).toBeVisible();
  await expect(
    page.getByText('If this email is eligible for password recovery,', { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length })),
  ).toEqual({ local: 0, session: 0 });
});

test('new password requires a verified recovery session and matching confirmation', async ({
  page,
}) => {
  let changed = 0;
  await page.route('**/api/v1/auth/password', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { status: 'ready' } });
    changed++;
    expect(route.request().postDataJSON()).toEqual({ password: 'new-fictional-password' });
    return route.fulfill({ json: { status: 'password_updated' } });
  });
  await page.goto('/reset-password');
  await page.getByLabel('New password', { exact: true }).fill('new-fictional-password');
  await page.getByLabel('Confirm new password').fill('different-fictional-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('don’t match');
  expect(changed).toBe(0);
  await page.getByLabel('Confirm new password').fill('new-fictional-password');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Your password is updated.' })).toBeVisible();
  expect(changed).toBe(1);
});

test('expired recovery link offers a fresh link without showing password inputs', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/password', (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: { code: 'RECOVERY_SESSION_REQUIRED', message: 'Open a fresh password-reset link.' },
      },
    }),
  );
  await page.goto('/reset-password');
  await expect(page.getByRole('link', { name: 'Request a new reset link' })).toBeVisible();
  await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0);
});

test('audio joins require assigned participation and fail honestly when calling is unavailable', async ({
  page,
}) => {
  await installWorkspace(page);
  const interviewId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let participant = false;
  const interview = {
    id: interviewId,
    applicationId: ids.application,
    jobId: ids.job,
    jobTitle: job.details!.title,
    company: job.company,
    slotId: null,
    startsAt: new Date(Date.now() + 60_000).toISOString(),
    endsAt: new Date(Date.now() + 16 * 60_000).toISOString(),
    timeZone: 'America/Toronto',
    status: 'scheduled',
    round: 1,
  };
  await page.route(`**/api/v1/jobs/${ids.job}/interview-slots`, (route) =>
    route.fulfill({ json: { slots: [] } }),
  );
  await page.route(`**/api/v1/jobs/${ids.job}/interviews`, (route) =>
    route.fulfill({ json: { interviews: [{ ...interview, isParticipant: participant }] } }),
  );
  let joins = 0;
  await page.route(`**/api/v1/interviews/${interviewId}/audio-session`, (route) => {
    joins++;
    return route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'unavailable',
          message: 'Audio calling is unavailable. Please try again later.',
        },
      },
    });
  });
  await page.goto('/workspace');
  await page.getByRole('tab', { name: 'Interviews', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Download calendar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open audio interview' })).toHaveCount(0);
  participant = true;
  await page.reload();
  await page.getByRole('tab', { name: 'Interviews', exact: true }).click();
  await page.getByRole('button', { name: 'Open audio interview' }).click();
  expect(joins).toBe(0);
  await expect(page.getByText('Join with your microphone off.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Join audio room', exact: true }).click();
  await expect(page.getByText('Not connected', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Audio calling is unavailable' }),
  ).toBeVisible();
  expect(joins).toBe(1);
  await expect(page.getByRole('button', { name: 'Unmute microphone' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /camera|screen share|complete interview|reveal identity/i }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Close audio panel' }).click();
  await expect(page.getByRole('region', { name: 'Blind audio interview' })).toHaveCount(0);
});
