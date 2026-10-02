import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { readJson, workflows, z } from '@swipe/server';
const Input = z.object({ cardId: UuidSchema }).strict();
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  return withActor(request, async (client) => {
    const jobId = UuidSchema.parse((await context.params).jobId);
    const body = Input.parse(await readJson(request));
    return {
      applicationId: await client.call(workflows.employerInterest, {
        p_job: jobId,
        p_card: body.cardId,
      }),
    };
  });
}
