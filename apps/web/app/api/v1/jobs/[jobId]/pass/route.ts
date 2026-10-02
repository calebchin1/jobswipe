import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { workflows } from '@swipe/server';

/** Candidate deck: swipe left. Hides the job from this candidate only. */
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return withActor(request, async (client) => {
    await client.call(workflows.passJob, { p_job: UuidSchema.parse((await context.params).jobId) });
    return { status: 'passed' };
  });
}
