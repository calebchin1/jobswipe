import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Apply →', exact: true })).toBeVisible();
});

test('saving never applies; applying and withdrawal remain distinct', async ({ page }) => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('tab', { name: /Applications/ }).click();
  await expect(page.getByText('Your story starts here.', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /Saved/ }).click();
  await expect(page.getByRole('button', { name: 'Remove from saved' })).toBeVisible();
  await page.getByRole('tab', { name: /Discover/ }).click();
  await page.getByRole('button', { name: 'Apply →', exact: true }).click();
  await page.getByRole('tab', { name: /Applications/ }).click();
  await page.getByRole('link', { name: 'View timeline →' }).click();
  await expect(page.getByText('Your timeline', { exact: true })).toBeVisible();
  await expect(page.getByText('Identity hidden', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw application' }).click();
  await page.getByRole('button', { name: 'Keep application' }).click();
  await expect(page.getByRole('button', { name: 'Withdraw application' })).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw application' }).click();
  await page.getByRole('button', { name: 'Confirm withdrawal' }).click();
  await expect(
    page.getByText('This sample application is closed.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Withdraw application' })).toHaveCount(0);
});

test('only one pass can be undone per demo session', async ({ page }) => {
  const undo = page.getByRole('button', { name: 'Undo last pass' });
  await expect(undo).toBeDisabled();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await undo.click();
  await expect(
    page.getByRole('link', { name: 'Read Campus café team member job details' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pass', exact: true }).click();
  await expect(undo).toBeDisabled();
});

test('profile edits stay in the fictional session and reset clears them', async ({
  page,
}, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('candidate-preview.png') });
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page
    .getByRole('textbox', { name: 'Demo profile headline' })
    .fill('Fictional helpful teammate');
  await page.getByRole('button', { name: 'Save demo headline' }).click();
  await expect(page.getByText('Fictional helpful teammate', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo session' }).click();
  await expect(page.getByRole('textbox', { name: 'Demo profile headline' })).not.toHaveValue(
    'Fictional helpful teammate',
  );
});
