import { withActor } from '../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

export async function GET(request: Request) {
  return withActor(request, async (client) => ({
    applications: await client.call(workflows.myApplications, {}),
  }));
}
