import { test, expect, type Page } from '@playwright/test';

const mobileOrigin = process.env.TEST_MOBILE_URL ?? 'http://127.0.0.1:3112';
const bookstoreJob = '30000000-0000-4000-8000-000000000002';
const apiOrigin = process.env.TEST_APP_ORIGIN ?? 'http://127.0.0.1:3102';

async function signIn(page: Page, email = process.env.TEST_CANDIDATE_EMAIL!) {
  await page.getByLabel('Account email').fill(email);
  await page.getByLabel('Account password').fill(process.env.TEST_AUTH_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${mobileOrigin}/live`);
  await expect(page.getByText(/in your deck|You’re all caught up/).first()).toBeVisible();
}

test('candidate records and removes private adult-pilot declarations through the mobile form', async ({
  page,
  request,
}) => {
  const email = `adult-pilot-${crypto.randomUUID()}@example.invalid`;
  const signup = await request.post(`${process.env.TEST_AUTH_URL}/auth/v1/signup`, {
    headers: { apikey: process.env.TEST_AUTH_KEY! },
    data: {
      email,
      password: process.env.TEST_AUTH_PASSWORD!,
      data: { requested_role: 'candidate' },
    },
  });
  expect(signup.ok()).toBeTruthy();
  const session = await signup.json();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  expect(
    (
      await request.post(`${apiOrigin}/api/v1/account/bootstrap`, {
        headers,
        data: { role: 'candidate' },
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${mobileOrigin}/account`);
  await signIn(page, email);
  await page.getByRole('link', { name: 'Edit blind profile' }).click();
  await expect(page.getByText('Attestation: not started')).toBeVisible();
  await page.getByRole('switch', { name: 'I am 18 years old or older' }).check();
  await page.getByRole('switch', { name: 'I am legally authorized to work in Ontario' }).check();
  await page.getByRole('button', { name: 'Save pilot eligibility' }).click();
  await expect(page.getByText('Attestation: eligible')).toBeVisible();
  const response = await request.get(`${apiOrigin}/api/v1/candidate/eligibility`, { headers });
  expect((await response.json()).eligibility.status).toBe('eligible');
  const jobs = await request.get(`${apiOrigin}/api/v1/candidate/jobs`, { headers });
  expect((await jobs.json()).jobs.every((job: { canApply: boolean }) => !job.canApply)).toBe(true);
  await page.getByRole('switch', { name: 'I am legally authorized to work in Ontario' }).uncheck();
  await page.getByRole('button', { name: 'Save pilot eligibility' }).click();
  await expect(page.getByText('Attestation: not eligible')).toBeVisible();
  await page.getByLabel('headline', { exact: true }).fill('Peer tutor for 12 students');
  await page.getByLabel('school', { exact: true }).fill('Example University');
  await page.getByLabel('educationLevel', { exact: true }).fill('Bachelor');
  await page.getByLabel('field', { exact: true }).fill('Math');
  await page.getByLabel('studyStatus', { exact: true }).fill('Year 2');
  await page.getByLabel('Available hours per week', { exact: true }).fill('18');
  await page
    .getByLabel('Profile skills', { exact: true })
    .fill('Math, Communication, Organization');
  await page.getByLabel('Profile impact bullets', { exact: true }).fill('Tutored 12 students.');
  await page.getByRole('button', { name: 'Save draft for review' }).click();
  await expect(
    page.getByText('Draft saved for review. It is not automatically published to employers.'),
  ).toBeVisible();
  const profileResponse = await request.get(`${apiOrigin}/api/v1/candidate/profile`, { headers });
  const profile = (await profileResponse.json()).profile;
  expect(profile.draft.school).toBe('Example University');
  expect(profile.draft.hoursPerWeek).toBe(18);
  expect(profile.published).toBeNull();
  await page.screenshot({
    path: test.info().outputPath('adult-pilot-onboarding.png'),
    fullPage: true,
  });
});
/** Passes real deck cards until the job is on top; returns how many passes to undo later. */
async function showJob(page: Page, title: string) {
  for (let passes = 0; passes < 6; passes++) {
    // Only the top (swipeable) card counts; the next card peeks behind it.
    const top = page.getByLabel(/Swipe right to apply/).filter({ visible: true });
    if ((await top.getAttribute('aria-label'))?.startsWith(`${title}.`)) return passes;
    await page.getByRole('button', { name: 'Pass', exact: true }).click();
    await expect(page.getByText(/^Passed on /)).toBeVisible();
  }
  throw new Error(`${title} never reached the top of the deck`);
}

test('mobile browser application persists in the database after its memory-only session expires', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${mobileOrigin}/account`);
  await signIn(page);
  const passes = await showJob(page, 'Store assistant');
  await page.getByRole('button', { name: 'Apply to this job', exact: true }).click();
  await expect(
    page.getByText('Application received by the server.', { exact: true }),
  ).toBeVisible();
  const applicationCard = page.getByText('Store assistant', { exact: true }).last().locator('..');
  await expect(applicationCard).toContainText('Applied');
  // Restore the shared fixture candidate's deck through the real undo path.
  for (let undo = 0; undo < passes; undo++) {
    await page.getByRole('button', { name: 'Undo last pass' }).click();
    await expect(page.getByText(/is back in your deck\.$/)).toBeVisible();
  }

  // A fresh document loses browser auth memory, but never deletes the server application.
  await page.reload();
  await expect(page.getByRole('link', { name: 'Open account connection →' })).toBeVisible();
  await expect(page.getByText('Store assistant', { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => /auth|token|supabase/i.test(key)),
    ),
  ).toEqual([]);
  await page.getByRole('link', { name: 'Open account connection →' }).click();
  await signIn(page);
  await expect(applicationCard).toContainText('Applied');

  // Verify the UI is backed by the real gateway + API + database, without network interception.
  const login = await request.post(
    `${process.env.TEST_AUTH_URL}/auth/v1/token?grant_type=password`,
    {
      headers: { apikey: process.env.TEST_AUTH_KEY! },
      data: { email: process.env.TEST_CANDIDATE_EMAIL!, password: process.env.TEST_AUTH_PASSWORD! },
    },
  );
  expect(login.ok()).toBeTruthy();
  const accessToken = (await login.json()).access_token as string;
  const headers = { Authorization: `Bearer ${accessToken}` };
  const before = await request.get(`${apiOrigin}/api/v1/candidate/applications`, { headers });
  expect(before.status()).toBe(200);
  const application = (await before.json()).applications.find(
    (value: { jobId: string }) => value.jobId === bookstoreJob,
  );
  expect(application?.stage).toBe('Applied');

  await applicationCard.getByRole('button', { name: 'Withdraw application', exact: true }).click();
  await applicationCard.getByRole('button', { name: 'Confirm live withdrawal' }).click();
  await expect(page.getByText('Application withdrawn.', { exact: true })).toBeVisible();
  await expect(applicationCard).toContainText('Withdrawn');
  const after = await request.get(`${apiOrigin}/api/v1/candidate/applications`, { headers });
  expect(after.status()).toBe(200);
  expect(
    (await after.json()).applications.find((value: { id: string }) => value.id === application.id)
      .stage,
  ).toBe('Withdrawn');
});
