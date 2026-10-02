import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { workflows, closeCancelledCalls } from '@swipe/server';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withActor(request, async (client) => {
    const applicationId=UuidSchema.parse((await context.params).id);
    await client.call(workflows.withdraw, {p_application:applicationId});
    return { status: 'withdrawn', callCleanup:await closeCancelledCalls(client,applicationId) };
  });
}
