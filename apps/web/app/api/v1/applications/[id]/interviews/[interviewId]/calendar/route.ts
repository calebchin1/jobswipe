import { withActor } from '../../../../../../../../src/server/session';
import { ApiFailure, interviewCalendar, workflows } from '@swipe/server';
import { UuidSchema, type ScheduledInterview } from '@swipe/contracts';
export async function GET(request:Request,context:{params:Promise<{id:string,interviewId:string}>}) {
 return withActor(request,async client=>{
  const params=await context.params;
  const applicationId=UuidSchema.parse(params.id);const interviewId=UuidSchema.parse(params.interviewId);
  const interviews=await client.call(workflows.applicationInterviews,{p_application:applicationId}) as ScheduledInterview[];
  const interview=interviews.find(item=>item.id===interviewId);
  if(!interview) throw new ApiFailure(404,'NOT_FOUND','This interview is unavailable.');
  return new Response(interviewCalendar(interview),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="interview.ics"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 });
}
