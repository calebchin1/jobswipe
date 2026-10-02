import { withActor } from '../../../../../src/server/session';
import { workflows, readJson, z } from '@swipe/server';
import {
  UuidSchema,
  AccountRoleSchema,
  EmployerInputSchema,
  ProfileDraftSchema,
  LiveJobDraftSchema,
} from '@swipe/contracts';

const Query = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  after: UuidSchema.optional(),
});
export async function GET(request: Request) {
  return withActor(request, async (client) => {
    const url = new URL(request.url);
    const query = Query.parse(Object.fromEntries(url.searchParams));
    const jobs = (await client.call(workflows.openJobs, {
      p_limit: query.limit,
      p_after: query.after ?? null,
    })) as { id: string }[];
    return { jobs, nextCursor: jobs.length === query.limit ? jobs.at(-1)!.id : null };
  });
}
