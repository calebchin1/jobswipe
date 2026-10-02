import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson } from '@swipe/server';
import { UuidSchema, CreateInterviewSlotSchema, BookInterviewSchema, CancelInterviewSchema } from '@swipe/contracts';
export async function GET(request:Request,context:{params:Promise<{jobId:string}>}) {return withActor(request,async client=>({interviews:await client.call(workflows.jobInterviews,{p_job:UuidSchema.parse((await context.params).jobId)})}));}