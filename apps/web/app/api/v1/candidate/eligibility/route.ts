import { AdultPilotAttestationSchema } from '@swipe/contracts';
import { readJson, workflows } from '@swipe/server';
import { withActor } from '../../../../../src/server/session';

export async function GET(request: Request) {
  return withActor(request, async (client) => ({
    eligibility: await client.call(workflows.candidateEligibility, {}),
  }));
}
export async function POST(request: Request) {
  return withActor(request, async (client) => {
    const input = AdultPilotAttestationSchema.parse(await readJson(request));
    return {
      eligibility: await client.call(workflows.attestEligibility, {
        p_adult: input.adult,
        p_authorized_to_work: input.authorizedToWork,
        p_policy_version: input.policyVersion,
      }),
    };
  });
}
