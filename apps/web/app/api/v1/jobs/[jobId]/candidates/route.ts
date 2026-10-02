import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { workflows } from '@swipe/server';

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return withActor(request, async (client) => {
    const jobId = UuidSchema.parse((await context.params).jobId);
    return { candidates: await client.call(workflows.candidates, { p_job: jobId }) };
  });
}
