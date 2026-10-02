import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson } from '@swipe/server';
import { UuidSchema, CreateInterviewSlotSchema, BookInterviewSchema, CancelInterviewSchema } from '@swipe/contracts';
type Context={params:Promise<{jobId:string}>};
export async function GET(request:Request,context:Context) {return withActor(request,async client=>({slots:await client.call(workflows.employerInterviewSlots,{p_job:UuidSchema.parse((await context.params).jobId)})}));}
export async function POST(request:Request,context:Context) {return withActor(request,async client=>{const body=CreateInterviewSlotSchema.parse(await readJson(request));return {slot:await client.call(workflows.createInterviewSlot,{p_job:UuidSchema.parse((await context.params).jobId),p_starts_at:body.startsAt,p_ends_at:body.endsAt,p_time_zone:body.timeZone})};});}