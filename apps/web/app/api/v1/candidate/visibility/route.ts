import { withActor } from '../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

const Input = z.object({ discoverable: z.boolean() }).strict();
export async function PATCH(request: Request) {
  return withActor(request, async (client) => ({
    profile: await client.call(workflows.candidateVisibility, {
      p_discoverable: Input.parse(await readJson(request)).discoverable,
    }),
  }));
}
