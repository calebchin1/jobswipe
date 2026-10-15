import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

/** Runs only against the ephemeral test gateway and isolated database owned by the runner. */
export async function testConnectedOperations(backend, origin) {
  const password = 'Synthetic-only-password1!';
  async function account(role) {
    const response = await fetch(`${backend.url}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: backend.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `ops-${randomUUID()}@example.invalid`,
        password,
        data: { requested_role: role },
      }),
    });
    assert.equal(response.status, 200);
    const session = await response.json();
    async function api(path, method = 'GET', body) {
      const result = await fetch(`${origin}/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: result.status, value: await result.json() };
    }
    assert.equal((await api('/account/bootstrap', 'POST', { role })).status, 200);
    return { id: session.user.id, api };
  }
  const candidate = await account('candidate');
  const draft = {
    headline: 'Synthetic private draft',
    educationLevel: 'Bachelor',
    field: 'Math',
    studyStatus: 'Studying',
    school: 'Example University',
    hoursPerWeek: 18,
    bullets: ['Helped a student club'],
    skills: ['Organization'],
  };
  assert.equal(
    (await candidate.api('/candidate/profile', 'PUT', { draft, discoverable: true })).status,
    200,
  );
  const pending = await backend.review('get_candidate_draft', { p_candidate: candidate.id });
  const reviewed = { ...draft, headline: 'Organized and ready to learn' };
  const proposal = await backend.review('propose_candidate_profile', {
    p_candidate: candidate.id,
    p_expected_revision: pending.draftRevision,
    p_content: reviewed,
    p_evidence_note: 'Synthetic test: reviewed structured anonymous content.',
  });
  const before = await candidate.api('/candidate/profile');
  assert.equal(before.value.profile.reviewStatus, 'awaiting_approval');
  assert.equal(before.value.profile.published, null);
  assert.equal(before.value.profile.proposal.id, proposal.id);
  const approved = await candidate.api('/candidate/profile/approve', 'POST', {
    proposalId: proposal.id,
  });
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.value.profile.published, reviewed);
  assert.equal(approved.value.profile.reviewStatus, 'approved');
  const jobs = await candidate.api('/candidate/jobs');
  assert(
    jobs.value.jobs.every((job) => !job.canApply),
    'Profile approval never grants eligibility',
  );
  assert.equal(
    (await candidate.api('/candidate/eligibility')).value.eligibility.status,
    'not_started',
  );
  const declarations = { adult: true, authorizedToWork: true, policyVersion: 'adult-pilot-v1' };
  assert.equal(
    (
      await candidate.api('/candidate/eligibility', 'POST', {
        ...declarations,
        candidateId: 'other',
      })
    ).status,
    422,
  );
  assert.equal(
    (await candidate.api('/candidate/eligibility', 'POST', { ...declarations, adult: false })).value
      .eligibility.status,
    'not_eligible',
  );
  assert.equal(
    (await candidate.api('/candidate/eligibility', 'POST', declarations)).value.eligibility.status,
    'eligible',
  );
  assert(
    (await candidate.api('/candidate/jobs')).value.jobs.some((job) => job.canApply),
    'Attestation plus approved profile permits application',
  );
  assert.equal(
    (
      await candidate.api('/candidate/eligibility', 'POST', {
        ...declarations,
        authorizedToWork: false,
      })
    ).value.eligibility.status,
    'not_eligible',
  );
  assert(
    (await candidate.api('/candidate/jobs')).value.jobs.every((job) => !job.canApply),
    'Removing attestation blocks new applications',
  );
  assert.equal(
    (
      await candidate.api('/candidate/profile', 'PUT', {
        draft: { ...draft, headline: 'A changed draft' },
      })
    ).status,
    200,
  );
  const nextDraft = await backend.review('get_candidate_draft', { p_candidate: candidate.id });
  const staleProposal = await backend.review('propose_candidate_profile', {
    p_candidate: candidate.id,
    p_expected_revision: nextDraft.draftRevision,
    p_content: { ...reviewed, headline: 'Another reviewed version' },
    p_evidence_note: 'Synthetic stale-proposal test.',
  });
  assert.equal(
    (
      await candidate.api('/candidate/profile', 'PUT', {
        draft: { ...draft, headline: 'Changed again before approval' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await candidate.api('/candidate/profile/approve', 'POST', { proposalId: staleProposal.id }))
      .status,
    409,
  );
  const after = await candidate.api('/candidate/profile');
  assert.deepEqual(after.value.profile.published, reviewed);
  assert.equal(after.value.profile.proposal, null);

  const employer = await account('employer');
  assert.equal((await employer.api('/candidate/eligibility')).status, 403);
  const website = 'https://operational-test.example.invalid';
  const created = await employer.api('/employers', 'POST', {
    name: 'Operational Synthetic Business',
    website,
  });
  assert.equal(created.status, 200);
  const employerId = created.value.employerId;
  assert.equal(
    (await employer.api('/me')).value.account.employers[0].verificationStatus,
    'pending',
  );
  const verified = await backend.review('verify_employer', {
    p_employer: employerId,
    p_expected_website: website,
    p_evidence_note: 'Synthetic verification only; no external business contacted.',
  });
  assert.equal(verified.verificationStatus, 'verified');
  assert.equal(
    (await employer.api('/me')).value.account.employers[0].verificationStatus,
    'verified',
  );
  console.log(
    'Connected operational review, exact candidate approval, stale proposal and eligibility separation passed.',
  );
}
