import { withActor } from '../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { workflows } from '@swipe/server';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return withActor(request, async (client) => {
    return {
      identity: await client.call(workflows.identity, {
        p_reveal: UuidSchema.parse((await context.params).id),
      }),
    };
  });
}
