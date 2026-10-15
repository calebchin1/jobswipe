import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-ready="true"]')).toBeVisible();
});

test('candidate card presents education, hours, three skills and three experiences', async ({
  page,
}) => {
  const card = page.locator('.deck-stack > .swipe-card');
  await expect(page.getByText('Your next great teammate.')).toHaveCount(0);
  await expect(card).not.toContainText('Identity protected');
  await expect(card).toContainText('Peer tutor for 12 students');
  await expect(card).toContainText('University of Waterloo');
  await expect(card).toContainText('Mathematics');
  await expect(card.locator('.deck-facts > div').last()).toContainText('18');
  await expect(card.locator('.deck-facts > div').last()).toContainText('Hours / week');
  await expect(card.locator('.deck-chips span')).toHaveCount(3);
  await expect(card.locator('.deck-evidence li')).toHaveCount(3);
});

test('profile fills the card, returns with browser back, forward, bottom button and keyboard', async ({
  page,
}) => {
  const open = page.getByRole('button', { name: 'See profile details' });
  await open.click();
  const profile = page.getByRole('region', { name: 'Candidate A7F2 profile' });
  await expect(profile).toBeVisible();
  await expect(page).toHaveURL(/#profile-A7F2$/);
  const card = (await page.locator('.deck-stack > .swipe-card').boundingBox())!;
  const sheet = (await profile.boundingBox())!;
  expect(sheet.height).toBeGreaterThan(card.height * 0.95);
  const close = profile.getByRole('button', { name: 'Hide profile details' });
  await expect(close).toContainText('←');
  const button = (await close.boundingBox())!;
  expect(button.y).toBeGreaterThan(sheet.y + sheet.height * 0.75);
  expect(
    await profile.locator('.deck-sheet-scroll').evaluate((e) => getComputedStyle(e).scrollbarWidth),
  ).toBe('none');
  await page.goBack();
  await expect(profile).toHaveCount(0);
  await expect(open).toBeFocused();
  await page.goForward();
  await expect(profile).toBeVisible();
  await close.click();
  await expect(profile).toHaveCount(0);
  await open.click();
  await page.keyboard.press('Escape');
  await expect(profile).toHaveCount(0);
  await open.click();
  await page.keyboard.press('ArrowLeft');
  await expect(profile).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Candidate A7F2' })).toBeVisible();
});

test('right swipe returns from a profile without passing or expressing interest', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'See profile details' }).click();
  const profile = page.getByRole('region', { name: 'Candidate A7F2 profile' });
  await profile.scrollIntoViewIfNeeded();
  const box = (await profile.boundingBox())!;
  const x = box.x + 30;
  const y = box.y + 50;
  if (test.info().project.name === 'mobile') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: x + step * 18, y: y + 2 }],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 144, y + 2, { steps: 8 });
    await page.mouse.up();
  }
  await expect(profile).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Candidate A7F2' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Undo last/ })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: 'It’s a match!' })).toHaveCount(0);
});
