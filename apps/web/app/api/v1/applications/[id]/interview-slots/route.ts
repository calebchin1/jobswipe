import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson } from '@swipe/server';
import { UuidSchema, CreateInterviewSlotSchema, BookInterviewSchema, CancelInterviewSchema } from '@swipe/contracts';
export async function GET(request:Request,context:{params:Promise<{id:string}>}) {return withActor(request,async client=>({slots:await client.call(workflows.applicationInterviewSlots,{p_application:UuidSchema.parse((await context.params).id)})}));}