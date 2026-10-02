import { test, expect, type Page } from '@playwright/test';
const candidate = '10000000-0000-4000-8000-000000000001';
const jobId = '20000000-0000-4000-8000-000000000002';
const appId = '30000000-0000-4000-8000-000000000003';
const draft = {
  headline: 'Patient learning assistant',
  educationLevel: 'Bachelor’s',
  field: 'Math',
  studyStatus: 'Year 2',
  skills: ['Math'],
  bullets: ['Helped peers prepare for exams.'],
};
async function mockService(
  page: Page,
  {
    eligible = true,
    fail = false,
    matched = false,
    bookingConflict = false,
    proposalPending = false,
    staleProposal = false,
    audioParticipant = true,
    employerInterested = false,
  } = {},
) {
  let applied = matched;
  matched = matched || employerInterested;
  let passed = false;
  let booked = false;
  let cancelled = false;
  let slotTaken = false;
  const slotId = '50000000-0000-4000-8000-000000000005';
  const interviewId = '60000000-0000-4000-8000-000000000006';
  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString();
  const interview = () => ({
    id: interviewId,
    applicationId: appId,
    jobId,
    jobTitle: 'Learning assistant',
    company: 'Connected Learning Centre',
    slotId,
    startsAt,
    endsAt,
    timeZone: 'America/Toronto',
    status: cancelled ? 'cancelled' : 'scheduled',
    round: 1,
    isParticipant: audioParticipant,
  });
  let withdrawn = false;
  let saved = false;
  let proposalActive = proposalPending;
  let proposalApproved = false;
  const proposalId = '70000000-0000-4000-8000-000000000007';
  const reviewed = {
    ...draft,
    headline: 'Reviewed learning assistant',
    bullets: ['Helped peers in a study group.'],
  };
  let discoverable = false;
  const profileView = () => ({
    draft: saved ? { ...draft, headline: 'Careful learning assistant' } : draft,
    published: proposalApproved ? reviewed : eligible ? draft : null,
    reviewStatus: proposalActive
      ? 'awaiting_approval'
      : saved
        ? 'pending_review'
        : proposalApproved || eligible
          ? 'approved'
          : 'pending_review',
    discoverable,
    proposal: proposalActive ? { id: proposalId, draftRevision: 1, content: reviewed } : null,
  });
  await page.route('**/auth/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/logout')) return route.fulfill({ status: 204 });
    const token = [
      btoa(JSON.stringify({ alg: 'HS256' })).replaceAll('=', ''),
      btoa(
        JSON.stringify({ sub: candidate, exp: Math.floor(Date.now() / 1000) + 3600 }),
      ).replaceAll('=', ''),
      'test-signature',
    ].join('.');
    return route.fulfill({
      json: {
        access_token: token,
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: candidate,
          email: 'candidate@example.test',
          aud: 'authenticated',
          role: 'authenticated',
          app_metadata: { provider: 'email' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      },
    });
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1', '');
    expect(request.headers().authorization).toMatch(/^Bearer /);
    const account = {
      accountId: candidate,
      status: 'active',
      roles: ['candidate'],
      employers: [],
      candidate: { reviewStatus: eligible ? 'approved' : 'pending_review', discoverable: false },
    };
    if (path === '/account/bootstrap') return route.fulfill({ json: { account } });
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Live service is unavailable.' } },
      });
    if (path === '/me') return route.fulfill({ json: { account } });
    if (path === '/candidate/profile/approve') {
      expect(request.postDataJSON()).toEqual({ proposalId });
      if (staleProposal) {
        proposalActive = false;
        saved = true;
        return route.fulfill({
          status: 409,
          json: { error: { message: 'This proposal is stale. Review the latest draft.' } },
        });
      }
      proposalActive = false;
      proposalApproved = true;
      return route.fulfill({ json: { profile: profileView() } });
    }
    if (path === '/candidate/profile' || path === '/candidate/visibility') {
      if (request.method() === 'PATCH') discoverable = request.postDataJSON().discoverable;
      if (request.method() === 'PUT') {
        expect(request.postDataJSON().draft.headline).toBe('Careful learning assistant');
        saved = true;
        proposalActive = false;
      }
      return route.fulfill({ json: { profile: profileView() } });
    }
    if (path === '/candidate/jobs')
      return route.fulfill({
        json: {
          jobs: passed
            ? []
            : [
                {
                  id: jobId,
                  employerId: '40000000-0000-4000-8000-000000000004',
                  company: 'Connected Learning Centre',
                  status: 'open',
                  versionId: null,
                  hasUnpublishedChanges: false,
                  canApply: eligible,
                  details: {
                    title: 'Learning assistant',
                    description:
                      'Help students work through practice questions in a supported learning environment.',
                    payMinMinor: 2200,
                    payMaxMinor: 2600,
                    payPeriod: 'hour',
                    currency: 'CAD',
                    location: 'Waterloo',
                    hoursPerWeek: 12,
                    schedule: ['Mon'],
                    skills: ['Math'],
                    mustHaves: ['Patience'],
                    niceToHaves: [],
                    questions: [],
                    isVacancy: true,
                    usesAiScreening: false,
                    workplaceType: 'office',
                    minimumAge: 14,
                    jobType: 'Part-time',
                  },
                },
              ],
          nextCursor: null,
        },
      });
    if (path === '/candidate/applications')
      return route.fulfill({
        json: {
          applications: applied
            ? [
                {
                  id: appId,
                  jobId,
                  jobTitle: 'Learning assistant',
                  company: 'Connected Learning Centre',
                  stage: withdrawn
                    ? 'Withdrawn'
                    : booked
                      ? 'Interview booked'
                      : matched
                        ? 'Matched'
                        : 'Applied',
                  appliedAt: '2026-09-29T12:00:00Z',
                  matchedAt: matched ? '2026-09-29T12:01:00Z' : null,
                  withdrawnAt: withdrawn ? '2026-09-29T12:05:00Z' : null,
                },
              ]
            : [],
        },
      });
    if (path === `/interviews/${interviewId}/audio-session`)
      return route.fulfill({
        status: 503,
        json: { error: { message: 'Audio service is not configured.' } },
      });
    if (path === '/candidate/interviews')
      return route.fulfill({ json: { interviews: booked || cancelled ? [interview()] : [] } });
    if (path === `/applications/${appId}/interview-slots`)
      return route.fulfill({
        json: {
          slots:
            booked || slotTaken
              ? []
              : [
                  {
                    id: slotId,
                    jobId,
                    startsAt,
                    endsAt,
                    timeZone: 'America/Toronto',
                    status: 'available',
                  },
                ],
        },
      });
    if (path === `/applications/${appId}/interviews` && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({ slotId });
      if (bookingConflict) {
        slotTaken = true;
        return route.fulfill({
          status: 409,
          json: { error: { message: 'That slot was just booked. Refresh availability.' } },
        });
      }
      booked = true;
      cancelled = false;
      return route.fulfill({ json: { interview: interview() } });
    }
    if (path === `/interviews/${interviewId}/cancel`) {
      booked = false;
      cancelled = true;
      return route.fulfill({ json: { interview: interview() } });
    }
    if (path === `/jobs/${jobId}/pass`) {
      passed = true;
      return route.fulfill({ json: { status: 'passed' } });
    }
    if (path === `/jobs/${jobId}/pass/undo`) {
      passed = false;
      return route.fulfill({ json: { status: 'restored' } });
    }
    if (path === `/jobs/${jobId}/apply`) {
      applied = true;
      return route.fulfill({ json: { applicationId: appId } });
    }
    if (path === `/applications/${appId}/withdraw`) {
      withdrawn = true;
      return route.fulfill({ json: { status: 'withdrawn' } });
    }
    return route.fulfill({ status: 404, json: { error: { message: 'Unknown test route' } } });
  });
}
async function signIn(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: /Profile/ }).click();
  await page.getByText('Connect a real candidate account →').click();
  await page.getByLabel('Account email').fill('candidate@example.test');
  await page.getByLabel('Account password').fill('test-password-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
test('connected candidate applies, withdraws, saves a review draft, and signs out', async ({
  page,
}) => {
  await mockService(page);
  await signIn(page);
  await expect(page.getByText('Connected Learning Centre').first()).toBeVisible();
  await page.getByRole('button', { name: 'Apply to this job' }).click();
  await expect(page.getByText('Application received by the server.')).toBeVisible();
  await page.getByRole('button', { name: 'Withdraw application', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm live withdrawal' }).click();
  await expect(page.getByText('Application withdrawn.', { exact: true })).toBeVisible();
  await page.getByText('Edit blind profile', { exact: true }).click();
  await page.getByLabel('headline', { exact: true }).fill('Careful learning assistant');
  await page.getByRole('switch', { name: 'Live profile discoverability' }).click();
  await expect(page.getByText('Discovery enabled for your approved profile.')).toBeVisible();
  await expect(page.getByLabel('headline', { exact: true })).toHaveValue(
    'Careful learning assistant',
  );
  await page.getByRole('button', { name: 'Save draft for review' }).click();
  await expect(
    page.getByText('Draft saved for review. It is not automatically published to employers.'),
  ).toBeVisible();
  await page.getByText('Back to live jobs and applications →').click();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out of this device' }).click();
  await expect(page.getByLabel('Account password')).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes('auth'))),
  ).toEqual([]);
});
test('pending candidate sees real jobs but cannot apply', async ({ page }) => {
  await mockService(page, { eligible: false });
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Application checks pending' })).toBeDisabled();
  await expect(page.getByText('Profile: pending review')).toBeVisible();
});
test('live API failures show an error without fictional replacements', async ({ page }) => {
  await mockService(page, { fail: true });
  await signIn(page);
  await expect(page.getByText('Live service is unavailable.')).toBeVisible();
  await expect(page.getByText('Northside Coffee')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Apply to this job' })).toHaveCount(0);
});

test('matched candidate books and cancels a real slot without completing or revealing', async ({
  page,
}) => {
  await mockService(page, { matched: true });
  await signIn(page);
  await page.getByRole('link', { name: 'Manage interview →' }).click();
  await expect(page.getByText(/All times are shown in your device time zone/)).toBeVisible();
  await page.getByRole('button').filter({ hasText: /→/ }).click();
  await page.getByRole('button', { name: 'Confirm interview booking' }).click();
  await expect(
    page.getByText('Your interview is booked. The time below is confirmed by the server.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel interview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /complete|reveal/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel interview', exact: true }).click();
  await page.getByLabel('Optional interview cancellation reason').fill('Schedule changed');
  await page.getByRole('button', { name: 'Confirm interview cancellation' }).click();
  await expect(
    page.getByText(
      'Interview cancelled. Your application remains active unless separately withdrawn.',
    ),
  ).toBeVisible();
  await expect(page.getByText('cancelled', { exact: true })).toBeVisible();
});
test('a taken slot never becomes a false booking and refreshes the remaining availability', async ({
  page,
}) => {
  await mockService(page, { matched: true, bookingConflict: true });
  await signIn(page);
  await page.getByRole('link', { name: 'Manage interview →' }).click();
  await page.getByRole('button').filter({ hasText: /→/ }).click();
  await page.getByRole('button', { name: 'Confirm interview booking' }).click();
  await expect(page.getByText('That slot was just booked. Refresh availability.')).toBeVisible();
  await expect(
    page.getByText(
      'No available times right now. Refresh later; no time is reserved until booking is confirmed.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel interview', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Your interview is booked. The time below is confirmed by the server.'),
  ).toHaveCount(0);
});

test('candidate approves only the reviewed proposal ID without self-granting eligibility', async ({
  page,
}) => {
  await mockService(page, { proposalPending: true, eligible: false });
  await signIn(page);
  await page.getByRole('link', { name: 'Edit blind profile' }).click();
  await expect(page.getByText('Proposed version for your approval', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Your submitted draft for comparison', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Reviewed learning assistant', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve this exact version' }).click();
  await expect(
    page.getByText(
      'You approved the exact reviewed version. Eligibility checks are still separate.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve this exact version' })).toHaveCount(0);
  await expect(page.getByText('Currently approved version')).toBeVisible();
  await page.getByRole('link', { name: 'Back to live jobs and applications →' }).click();
  await expect(page.getByRole('button', { name: 'Application checks pending' })).toBeDisabled();
});
test('editing and resubmitting invalidates the proposal while retaining the published version', async ({
  page,
}) => {
  await mockService(page, { proposalPending: true });
  await signIn(page);
  await page.getByRole('link', { name: 'Edit blind profile' }).click();
  await page.getByLabel('headline', { exact: true }).fill('Careful learning assistant');
  await expect(page.getByRole('button', { name: 'Approve this exact version' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft for review' }).click();
  await expect(page.getByText('Review status: pending review')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve this exact version' })).toHaveCount(0);
  await expect(page.getByText('Currently approved version').locator('..')).toContainText(
    'Patient learning assistant',
  );
});
test('stale proposal rejection refreshes without publishing or approving a replacement', async ({
  page,
}) => {
  await mockService(page, { proposalPending: true, staleProposal: true });
  await signIn(page);
  await page.getByRole('link', { name: 'Edit blind profile' }).click();
  await page.getByRole('button', { name: 'Approve this exact version' }).click();
  await expect(page.getByText('This proposal is stale. Review the latest draft.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve this exact version' })).toHaveCount(0);
  await expect(page.getByText('Currently approved version').locator('..')).toContainText(
    'Patient learning assistant',
  );
  await expect(
    page.getByText(
      'You approved the exact reviewed version. Eligibility checks are still separate.',
    ),
  ).toHaveCount(0);
});

test('audio requires explicit join and missing provider configuration never starts microphone or SDK connection', async ({
  page,
}) => {
  let audioRequests = 0;
  let sockets = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/audio-session')) audioRequests++;
  });
  page.on('websocket', () => {
    sockets++;
  });
  await page.addInitScript(() => {
    const state = window as unknown as { micRequests: number };
    state.micRequests = 0;
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        state.micRequests++;
        throw new Error('Unexpected microphone access in configuration test');
      };
  });
  await mockService(page, { matched: true });
  await signIn(page);
  await page.getByRole('link', { name: 'Manage interview →' }).click();
  await page.getByRole('button').filter({ hasText: /→/ }).click();
  await page.getByRole('button', { name: 'Confirm interview booking' }).click();
  await page.getByRole('link', { name: 'Open audio lobby →' }).click();
  await expect(page.getByRole('button', { name: 'Join audio interview muted' })).toBeVisible();
  expect(audioRequests).toBe(0);
  await page.getByRole('button', { name: 'Join audio interview muted' }).click();
  await expect(page.getByText('Audio service is not configured.')).toBeVisible();
  expect(audioRequests).toBe(1);
  expect(sockets).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { micRequests: number }).micRequests),
  ).toBe(0);
  await expect(page.getByRole('button', { name: 'Enable microphone' })).toHaveCount(0);
});
test('an unassigned scheduling viewer has no audio lobby control', async ({ page }) => {
  await mockService(page, { matched: true, audioParticipant: false });
  await signIn(page);
  await page.getByRole('link', { name: 'Manage interview →' }).click();
  await page.getByRole('button').filter({ hasText: /→/ }).click();
  await page.getByRole('button', { name: 'Confirm interview booking' }).click();
  await expect(
    page.getByText('Your interview is booked. The time below is confirmed by the server.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open audio lobby →' })).toHaveCount(0);
});

async function touchSwipe(page: Page, dx: number, dy = 0) {
  const card = page.getByLabel(/Swipe right to apply/).filter({ visible: true });
  await card.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  // Touch scrolling can keep gliding; wait until the card stops moving before aiming.
  let box = (await card.boundingBox())!;
  for (let settle = 0; settle < 20; settle++) {
    await page.waitForTimeout(50);
    const next = (await card.boundingBox())!;
    if (next.y === box.y && next.x === box.x) break;
    box = next;
  }
  const x = box.x + box.width / 2;
  const y = box.y + Math.min(80, box.height / 2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 10; step++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + (dx * step) / 10, y: y + (dy * step) / 10 }],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('job deck swipes with touch: pass, undo, apply', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST') calls.push(new URL(request.url()).pathname);
  });
  await mockService(page);
  await signIn(page);
  await expect(page.getByText('1 job in your deck')).toBeVisible();

  await touchSwipe(page, 20, 260);
  await expect(page.getByText('1 job in your deck')).toBeVisible();
  expect(calls.some((path) => path.endsWith('/pass') || path.endsWith('/apply'))).toBe(false);

  await touchSwipe(page, -260);
  await expect(page.getByText(/Passed on Learning assistant/)).toBeVisible();
  await expect(page.getByText('You’re all caught up.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo last pass' }).click();
  await expect(page.getByText('Learning assistant is back in your deck.')).toBeVisible();

  await touchSwipe(page, 260);
  await expect(page.getByText('Application received by the server.')).toBeVisible();
  expect(calls.filter((path) => /\/jobs\/.+\/(pass|apply)/.test(path))).toEqual([
    `/api/v1/jobs/${jobId}/pass`,
    `/api/v1/jobs/${jobId}/pass/undo`,
    `/api/v1/jobs/${jobId}/apply`,
  ]);
});

test('ineligible right swipe is refused without calling apply', async ({ page }) => {
  await mockService(page, { eligible: false });
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Application checks pending' })).toBeDisabled();
  await touchSwipe(page, 260);
  await expect(page.getByText('Application checks are still pending for this job.')).toBeVisible();
  await expect(page.getByText('1 job in your deck')).toBeVisible();
});

test('applying where the employer already liked you shows the match screen', async ({ page }) => {
  await mockService(page, { employerInterested: true });
  await signIn(page);
  await page.getByRole('button', { name: 'Apply to this job' }).click();
  await expect(page.getByRole('heading', { name: 'It’s a match!' })).toBeVisible();
  await page.getByRole('button', { name: 'Plan your interview' }).click();
  await expect(page.getByText(/All times are shown in your device time zone/)).toBeVisible();
});
