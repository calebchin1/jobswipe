import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return withActor(request, async (client) => ({
    versionId: await client.call(workflows.publishJob, {
      p_job: UuidSchema.parse((await context.params).jobId),
    }),
  }));
}
