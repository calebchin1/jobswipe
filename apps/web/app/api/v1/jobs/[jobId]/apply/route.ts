import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { workflows } from '@swipe/server';

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return withActor(request, async (client) => {
    const jobId = UuidSchema.parse((await context.params).jobId);
    return { applicationId: await client.call(workflows.apply, { p_job: jobId }) };
  });
}
