import { withActor } from '../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

export async function POST(request: Request) {
  return withActor(request, async (client) => {
    const body = EmployerInputSchema.parse(await readJson(request));
    return {
      employerId: await client.call(workflows.createEmployer, {
        p_name: body.name,
        p_website: body.website,
      }),
    };
  });
}
