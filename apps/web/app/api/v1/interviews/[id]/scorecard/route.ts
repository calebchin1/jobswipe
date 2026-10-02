import { withActor } from '../../../../../../src/server/session';
import { ScoreSchema, UuidSchema } from '@swipe/contracts';
import { readJson, workflows, z } from '@swipe/server';
const Input = z
  .object({
    scores: z
      .array(z.object({ questionId: z.string().min(1).max(100), score: ScoreSchema }).strict())
      .min(3)
      .max(5),
  })
  .strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withActor(request, async (client) => {
    const interview = UuidSchema.parse((await context.params).id);
    const body = Input.parse(await readJson(request));
    return {
      scorecardId: await client.call(workflows.scorecard, {
        p_interview: interview,
        p_scores: body.scores,
      }),
    };
  });
}
