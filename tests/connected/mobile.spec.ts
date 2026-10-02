import { test, expect, type Page } from '@playwright/test';

const mobileOrigin = process.env.TEST_MOBILE_URL ?? 'http://127.0.0.1:3112';
const bookstoreJob = '30000000-0000-4000-8000-000000000002';
const apiOrigin = process.env.TEST_APP_ORIGIN ?? 'http://127.0.0.1:3102';

async function signIn(page: Page) {
  await page.getByLabel('Account email').fill(process.env.TEST_CANDIDATE_EMAIL!);
  await page.getByLabel('Account password').fill(process.env.TEST_AUTH_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${mobileOrigin}/live`);
  await expect(page.getByText(/in your deck|You’re all caught up/).first()).toBeVisible();
}
/** Passes real deck cards until the job is on top; returns how many passes to undo later. */
async function showJob(page: Page, title: string) {
  for (let passes = 0; passes < 6; passes++) {
    if (await page.getByText(title, { exact: true }).first().isVisible()) return passes;
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
