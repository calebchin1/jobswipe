import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson, closeCancelledCalls } from '@swipe/server';
import { UuidSchema, CancelInterviewSchema, type ScheduledInterview } from '@swipe/contracts';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {return withActor(request,async client=>{
 const interview=await client.call(workflows.cancelInterview,{p_interview:UuidSchema.parse((await context.params).id),p_reason:CancelInterviewSchema.parse(await readJson(request)).reason??null}) as ScheduledInterview;
 return {interview,callCleanup:await closeCancelledCalls(client,interview.applicationId)};
});}
