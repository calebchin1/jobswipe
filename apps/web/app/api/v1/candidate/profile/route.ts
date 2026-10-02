import { withActor } from '../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

const Input = z
  .object({ draft: ProfileDraftSchema, discoverable: z.boolean().optional() })
  .strict();
export async function GET(request: Request) {
  return withActor(request, async (client) => ({
    profile: await client.call(workflows.candidateProfile, {}),
  }));
}
export async function PUT(request: Request) {
  return withActor(request, async (client) => {
    const body = Input.parse(await readJson(request));
    return {
      profile: await client.call(workflows.saveCandidateProfile, {
        p_draft: body.draft,
        p_discoverable: body.discoverable ?? null,
      }),
    };
  });
}
