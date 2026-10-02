import { withActor } from '../../../../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { workflows } from '@swipe/server';

type Context = { params: Promise<{ jobId: string; cardId: string }> };
/** Employer deck: undo the last pass. */
export async function POST(request: Request, context: Context) {
  return withActor(request, async (client) => {
    const params = await context.params;
    await client.call(workflows.undoCardPass, {
      p_job: UuidSchema.parse(params.jobId),
      p_card: UuidSchema.parse(params.cardId),
    });
    return { status: 'restored' };
  });
}
