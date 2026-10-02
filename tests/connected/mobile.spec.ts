import { test, expect, type Page } from '@playwright/test';

const mobileOrigin = process.env.TEST_MOBILE_URL ?? 'http://127.0.0.1:3112';
const bookstoreJob = '30000000-0000-4000-8000-000000000002';
const apiOrigin = process.env.TEST_APP_ORIGIN ?? 'http://127.0.0.1:3102';

async function signIn(page: Page) {
  await page.getByLabel('Account email').fill(process.env.TEST_CANDIDATE_EMAIL!);
  await page.getByLabel('Account password').fill(process.env.TEST_AUTH_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${mobileOrigin}/live`);
  await expect(page.getByText('Store assistant', { exact: true }).first()).toBeVisible();
}

test('mobile browser application persists in the database after its memory-only session expires', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${mobileOrigin}/account`);
  await signIn(page);
  const posting = page.getByText('Store assistant', { exact: true }).first().locator('..');
  await posting.getByRole('button', { name: 'Apply to this job', exact: true }).click();
  await expect(
    page.getByText('Application received by the server.', { exact: true }),
  ).toBeVisible();
  await expect(posting.getByRole('button', { name: 'Applied', exact: true })).toBeDisabled();

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
  await expect(posting.getByRole('button', { name: 'Applied', exact: true })).toBeDisabled();

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

  const applicationCard = page.getByText('Store assistant', { exact: true }).last().locator('..');
  await applicationCard.getByRole('button', { name: 'Withdraw application', exact: true }).click();
  await applicationCard.getByRole('button', { name: 'Confirm live withdrawal' }).click();
  await expect(page.getByText('Application withdrawn.', { exact: true })).toBeVisible();
  await expect(posting.getByRole('button', { name: 'Withdrawn', exact: true })).toBeDisabled();
  const after = await request.get(`${apiOrigin}/api/v1/candidate/applications`, { headers });
  expect(after.status()).toBe(200);
  expect(
    (await after.json()).applications.find((value: { id: string }) => value.id === application.id)
      .stage,
  ).toBe('Withdrawn');
});
