import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
});

test('anonymous profile stays hidden through the guarded reveal workflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Your next great teammate.' })).toBeVisible();
  await expect(page.getByText('alex.morgan@example.test')).toHaveCount(0);
  await page.getByRole('button', { name: 'I’m interested' }).click();
  await expect(page.getByRole('dialog', { name: 'It’s a match!' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep swiping' }).click();
  await expect(page.getByRole('button', { name: /^Undo last/ })).toBeDisabled();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Interviews', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Reveal demo identity' })).toHaveCount(0);
  await page.getByRole('button', { name: /October 14/ }).click();
  await page.getByRole('button', { name: 'Simulate completed interview' }).click();
  await expect(page.getByRole('button', { name: 'Submit & lock scorecard' })).toBeDisabled();
  const groups = page.getByRole('group');
  await expect(groups).toHaveCount(3);
  for (let i = 0; i < 3; i++)
    await groups.nth(i).getByRole('radio', { name: '4', exact: true }).check();
  await page.getByRole('button', { name: 'Submit & lock scorecard' }).click();
  await expect(page.getByRole('button', { name: 'Scorecard locked' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reveal demo identity' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Simulate candidate authorization' }).click();
  await page.getByRole('button', { name: 'Reveal demo identity' }).click();
  await expect(page.getByText('alex.morgan@example.test')).toBeVisible();
  await page.getByRole('button', { name: 'Simulate candidate withdrawal' }).click();
  await expect(page.getByText('alex.morgan@example.test')).toHaveCount(0);
  await expect(page.getByText('Good conversations start with a match.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pass can be undone once without advancing an application', async ({ page }) => {
  await page.getByRole('button', { name: 'Pass for now' }).click();
  await expect(page.getByRole('heading', { name: 'Candidate K3M8' })).toBeVisible();
  const undo = page.getByRole('button', { name: /^Undo last/ });
  await undo.click();
  await expect(page.getByRole('heading', { name: 'Candidate A7F2' })).toBeVisible();
  await page.getByRole('button', { name: 'Pass for now' }).click();
  await expect(undo).toBeDisabled();
});

test('job editing rejects inverted pay and Canadian-experience requirements', async ({ page }) => {
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Your jobs', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit demo posting' }).click();
  await page.getByLabel('Minimum pay · CAD / hour').fill('30');
  await page.getByLabel('Maximum pay · CAD / hour').fill('20');
  await page.getByRole('button', { name: 'Save demo job' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await page.getByLabel('Minimum pay · CAD / hour').fill('18');
  await page.getByLabel('Maximum pay · CAD / hour').fill('22');
  await page.getByLabel('Must-have skills').fill('Canadian experience');
  await page.getByRole('button', { name: 'Save demo job' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(/Canadian experience/i);
  await page.getByLabel('Must-have skills').fill('Teamwork, Customer service');
  await page.getByLabel('Job title', { exact: true }).fill('Weekend café teammate');
  await page.getByRole('button', { name: 'Save demo job' }).click();
  await expect(page.getByRole('heading', { name: 'Weekend café teammate' })).toBeVisible();
});

test('viewport has no horizontal overflow', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('employer-preview.png'), fullPage: true });
});

test('authenticated endpoints reject anonymous callers and expose no private fields', async ({
  request,
}) => {
  const response = await request.post('/api/v1/jobs/11111111-1111-4111-8111-111111111111/apply');
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  expect((await response.json()).error.code).toBe('UNAUTHENTICATED');
  const health = await request.get('/api/v1/health');
  expect((await health.json()).interface).toBe('synthetic-demo');
});
