import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson } from '@swipe/server';
import { UuidSchema, CreateInterviewSlotSchema, BookInterviewSchema, CancelInterviewSchema } from '@swipe/contracts';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {return withActor(request,async client=>({interviews:await client.call(workflows.applicationInterviews,{p_application:UuidSchema.parse((await context.params).id)})}));}
export async function POST(request:Request,context:Context) {return withActor(request,async client=>({interview:await client.call(workflows.bookInterview,{p_application:UuidSchema.parse((await context.params).id),p_slot:BookInterviewSchema.parse(await readJson(request)).slotId})}));}