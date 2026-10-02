import { withActor } from '../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

const Input = z.object({ role: AccountRoleSchema }).strict();
export async function POST(request: Request) {
  return withActor(request, async (client) => ({
    account: await client.call(workflows.bootstrap, {
      p_role: Input.parse(await readJson(request)).role,
    }),
  }));
}
