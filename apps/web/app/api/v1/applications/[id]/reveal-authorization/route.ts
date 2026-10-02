import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { readJson, workflows, z } from '@swipe/server';
const Input = z
  .object({
    documentId: UuidSchema,
    recipientIds: z.array(UuidSchema).min(1).max(20),
    identityRevision: z.number().int().positive(),
  })
  .strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return withActor(request, async (client) => {
    const application = UuidSchema.parse((await context.params).id);
    const body = Input.parse(await readJson(request));
    return {
      authorizationId: await client.call(workflows.authorize, {
        p_application: application,
        p_document: body.documentId,
        p_recipients: body.recipientIds,
        p_identity_revision: body.identityRevision,
      }),
    };
  });
}
