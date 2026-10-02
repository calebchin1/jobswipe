import { test, expect, type APIRequestContext } from '@playwright/test';
const cafeJob = '30000000-0000-4000-8000-000000000001';
const bookstoreJob = '30000000-0000-4000-8000-000000000002';
const cafe = '10000000-0000-4000-8000-000000000001';
const gateway = process.env.TEST_AUTH_URL!;
const password = process.env.TEST_AUTH_PASSWORD!;
const employerEmail = process.env.TEST_EMPLOYER_EMAIL!;
const candidateEmail = process.env.TEST_CANDIDATE_EMAIL!;
const origin = process.env.TEST_APP_ORIGIN ?? 'http://127.0.0.1:3102';
async function token(request: APIRequestContext, email: string) {
  const response = await request.post(`${gateway}/auth/v1/token?grant_type=password`, {
    headers: { apikey: process.env.TEST_AUTH_KEY! },
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).access_token as string;
}

test('candidate application and employer match persist across authenticated clients', async ({
  page,
  request,
}) => {
  const accessToken = await token(request, candidateEmail);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const jobs = await request.get('/api/v1/candidate/jobs', { headers });
  expect(jobs.status()).toBe(200);
  expect((await jobs.json()).jobs.find((j: { id: string }) => j.id === cafeJob).canApply).toBe(
    true,
  );
  const applied = await request.post(`/api/v1/jobs/${cafeJob}/apply`, { headers });
  expect(applied.status()).toBe(200);
  const applicationId = (await applied.json()).applicationId;
  const retried = await request.post(`/api/v1/jobs/${cafeJob}/apply`, { headers });
  expect((await retried.json()).applicationId).toBe(applicationId);

  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill(employerEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole('heading', { name: 'Cafe assistant', exact: true })).toBeVisible();
  const card = page
    .locator('article')
    .filter({ hasText: 'Customer service and careful organization' });
  await expect(card).toBeVisible();
  expect(await card.innerText()).not.toMatch(
    /Alex Example|alex@example|00000000-0000-4000-8000-000000000001/,
  );
  await card.getByRole('button', { name: 'I’m interested' }).click();
  await expect(card.getByRole('button', { name: 'Mutual match ✓' })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Matched Both sides are interested' })).toBeVisible();
  const mine = await request.get('/api/v1/candidate/applications', { headers });
  expect(
    (await mine.json()).applications.find((a: { id: string }) => a.id === applicationId).stage,
  ).toBe('Matched');

  const cookies = await page.context().cookies();
  expect(cookies.filter((c) => c.name.startsWith('swipe-auth')).length).toBeGreaterThan(0);
  expect(
    cookies
      .filter((c) => c.name.startsWith('swipe-auth'))
      .every((c) => c.httpOnly && c.sameSite === 'Lax'),
  ).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('swipe-auth');
  const unrelated = await page.request.get(`/api/v1/jobs/${bookstoreJob}/applications`);
  expect(unrelated.status()).toBe(403);
  const csrf = await page.request.post(`/api/v1/jobs/${cafeJob}/interest`, {
    headers: { Origin: 'https://evil.invalid' },
    data: { cardId: crypto.randomUUID() },
  });
  expect(csrf.status()).toBe(403);
  const noOrigin = await page.request.post(`/api/v1/jobs/${cafeJob}/interest`, {
    data: { cardId: crypto.randomUUID() },
  });
  expect(noOrigin.status()).toBe(403);
  const identityAttempt = await page.request.get(`/api/v1/reveals/${applicationId}`);
  expect(identityAttempt.status()).toBe(403);

  const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString();
  const offered = await page.request.post(`/api/v1/jobs/${cafeJob}/interview-slots`, {
    headers: { Origin: origin }, data: { startsAt, endsAt, timeZone: 'America/Toronto' },
  });
  expect(offered.status()).toBe(200);
  const slot = (await offered.json()).slot;
  const slots = await request.get(`/api/v1/applications/${applicationId}/interview-slots`, { headers });
  expect((await slots.json()).slots.some((item: {id:string}) => item.id === slot.id)).toBe(true);
  const booked = await request.post(`/api/v1/applications/${applicationId}/interviews`, { headers, data: { slotId: slot.id } });
  expect(booked.status()).toBe(200);
  const interview = (await booked.json()).interview;
  expect(interview.status).toBe('scheduled');
  const duplicate = await request.post(`/api/v1/applications/${applicationId}/interviews`, { headers, data: { slotId: slot.id } });
  expect((await duplicate.json()).interview.id).toBe(interview.id);
  const employerInterviews = await page.request.get(`/api/v1/jobs/${cafeJob}/interviews`);
  expect((await employerInterviews.json()).interviews[0].id).toBe(interview.id);
  const calendar = await page.request.get(`/api/v1/applications/${applicationId}/interviews/${interview.id}/calendar`);
  expect(calendar.status()).toBe(200);
  expect(calendar.headers()['content-type']).toContain('text/calendar');
  expect(await calendar.text()).toContain('BEGIN:VEVENT');
  expect(await calendar.text()).not.toMatch(/Alex Example|alex@example|ATTENDEE/);
  const premature = await page.request.post(`/api/v1/interviews/${interview.id}/scorecard`, {headers:{Origin:origin},data:{scores:[{questionId:'q1',score:4},{questionId:'q2',score:4},{questionId:'q3',score:4}]}});
  expect(premature.status()).toBe(403);
  expect(
    (await request.post(`/api/v1/applications/${applicationId}/withdraw`, { headers })).status(),
  ).toBe(200);
  const afterWithdrawal = await request.get('/api/v1/candidate/interviews', {headers});
  expect((await afterWithdrawal.json()).interviews.find((item: {id:string})=>item.id===interview.id).status).toBe('cancelled');
  await page.reload();
  await page.getByRole('tab', { name: 'Applications', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Withdrawn candidate', exact: true })).toBeVisible();
  await expect(
    page.getByRole('cell').filter({ hasText: 'Customer service and careful organization' }),
  ).toHaveCount(0);
  const signout = await page.request.post('/api/v1/auth/sign-out', { headers: { Origin: origin } });
  expect(signout.status()).toBe(200);
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
});

test('signup never grants company verification or profile publication', async ({ request }) => {
  const email = `new-${crypto.randomUUID()}@example.invalid`;
  const signup = await request.post('/api/v1/auth/sign-up', {
    headers: { Origin: origin },
    data: { email, password, role: 'employer' },
  });
  expect(signup.status()).toBe(200);
  const me = await request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  expect((await me.json()).account.roles).toEqual(['employer']);
  const company = await request.post('/api/v1/employers', {
    headers: { Origin: origin },
    data: { name: 'Fictional New Business', website: 'https://new.example.invalid' },
  });
  expect(company.status()).toBe(200);
  const context = await request.get('/api/v1/me');
  expect((await context.json()).account.employers[0].verificationStatus).toBe('pending');
  expect((await request.get(`/api/v1/employers/${cafe}/jobs`)).status()).toBe(403);
  expect((await request.get(`/api/v1/jobs/${cafeJob}/candidates`)).status()).toBe(403);
  const bootstrap = await request.post('/api/v1/account/bootstrap', {
    headers: { Origin: origin },
    data: { role: 'candidate' },
  });
  expect(bootstrap.status()).toBe(200);
  const draft = {
    headline: 'Ready to learn',
    educationLevel: 'Secondary',
    field: 'General',
    studyStatus: 'Studying',
    bullets: [],
    skills: ['Organization'],
  };
  const saved = await request.put('/api/v1/candidate/profile', {
    headers: { Origin: origin },
    data: { draft, discoverable: true },
  });
  expect(saved.status()).toBe(200);
  expect((await saved.json()).profile).toMatchObject({
    reviewStatus: 'pending_review',
    published: null,
  });
  expect(
    (await request.post(`/api/v1/jobs/${cafeJob}/apply`, { headers: { Origin: origin } })).status(),
  ).toBe(403);
  const jobs = await request.get('/api/v1/candidate/jobs');
  expect((await jobs.json()).jobs.every((j: { canApply: boolean }) => !j.canApply)).toBe(true);
});

test('cookie refresh preserves actor identity without exposing tokens', async ({ page }) => {
  expect((await page.request.post('/api/v1/auth/sign-in',{headers:{Origin:origin},data:{email:employerEmail,password}})).status()).toBe(200);
  const sessionCookies=(await page.context().cookies()).filter(c=>c.name==='swipe-auth'||/^swipe-auth\.\d+$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name));
  const encoded=sessionCookies.map(c=>c.value).join('');
  expect(encoded.startsWith('base64-')).toBe(true);
  const session=JSON.parse(Buffer.from(encoded.slice(7),'base64url').toString());
  const oldRefresh=session.refresh_token;
  session.expires_at=1;
  const replacement=`base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
  await page.context().clearCookies({name:/^swipe-auth/});
  await page.context().addCookies([{...sessionCookies[0],name:'swipe-auth',value:replacement}]);
  const me=await page.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  expect((await me.json()).account.accountId).toBe('00000000-0000-4000-8000-000000000003');
  const refreshed=(await page.context().cookies()).filter(c=>c.name==='swipe-auth'||/^swipe-auth\.\d+$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(c=>c.value).join('');
  expect(JSON.parse(Buffer.from(refreshed.slice(7),'base64url').toString()).refresh_token).not.toBe(oldRefresh);
  expect((await page.request.get('/api/v1/me')).status()).toBe(200);
});

test('verified employer publishes immutable job versions and candidate sees only publication',async({request})=>{
  expect((await request.post('/api/v1/auth/sign-in',{headers:{Origin:origin},data:{email:employerEmail,password}})).status()).toBe(200);
  const draft={title:'New campus role',description:'Help organize stock and support customers.',payMinMinor:2000,payMaxMinor:2300,payPeriod:'hour',currency:'CAD',location:'Waterloo',hoursPerWeek:15,schedule:['Sat','Sun'],skills:['Organization'],mustHaves:['Weekend availability'],niceToHaves:[],questions:['How do you organize your work?','Tell us about helping a customer.','How do you learn a new task?'],isVacancy:true,usesAiScreening:false,workplaceType:'retail',jobType:'Part-time'};
  const saved=await request.post(`/api/v1/employers/${cafe}/jobs`,{headers:{Origin:origin},data:{draft}});
  expect(saved.status()).toBe(200);const jobId=(await saved.json()).jobId;
  const published=await request.post(`/api/v1/jobs/${jobId}/publish`,{headers:{Origin:origin}});
  expect(published.status()).toBe(200);const versionId=(await published.json()).versionId;
  expect((await (await request.post(`/api/v1/jobs/${jobId}/publish`,{headers:{Origin:origin}})).json()).versionId).toBe(versionId);
  expect((await request.post(`/api/v1/employers/${cafe}/jobs`,{headers:{Origin:origin},data:{jobId,draft:{...draft,title:'Changed unpublished title'}}})).status()).toBe(200);
  const accessToken=await token(request,candidateEmail);
  const jobs=await request.get('/api/v1/candidate/jobs',{headers:{Authorization:`Bearer ${accessToken}`}});
  const visible=(await jobs.json()).jobs.find((j:{id:string})=>j.id===jobId);
  expect(visible.details.title).toBe('New campus role');expect(visible.versionId).toBe(versionId);expect(visible.hasUnpublishedChanges).toBe(false);
  const next=await request.post(`/api/v1/jobs/${jobId}/publish`,{headers:{Origin:origin}});
  expect((await next.json()).versionId).not.toBe(versionId);
});
