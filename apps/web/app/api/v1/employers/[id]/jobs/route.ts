import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

type Context = { params: Promise<{ id: string }> };
const Input = z.object({ draft: LiveJobDraftSchema, jobId: UuidSchema.optional() }).strict();
export async function GET(request: Request, context: Context) {
  return withActor(request, async (client) => ({
    jobs: await client.call(workflows.employerJobs, {
      p_employer: UuidSchema.parse((await context.params).id),
    }),
  }));
}
export async function POST(request: Request, context: Context) {
  return withActor(request, async (client) => {
    const body = Input.parse(await readJson(request));
    return {
      jobId: await client.call(workflows.saveJob, {
        p_employer: UuidSchema.parse((await context.params).id),
        p_job: body.jobId ?? null,
        p_draft: body.draft,
      }),
    };
  });
}
