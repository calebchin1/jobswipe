import { withActor } from '../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { readJson, workflows, z } from '@swipe/server';
const Input = z.object({ authorizationId: UuidSchema }).strict();
export async function POST(request: Request) {
  return withActor(request, async (client) => {
    const body = Input.parse(await readJson(request));
    return {
      revealId: await client.call(workflows.reveal, { p_authorization: body.authorizationId }),
    };
  });
}
