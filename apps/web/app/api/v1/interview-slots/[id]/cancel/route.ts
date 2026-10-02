import { withActor } from '../../../../../../src/server/session';
import { workflows, readJson } from '@swipe/server';
import { UuidSchema, CreateInterviewSlotSchema, BookInterviewSchema, CancelInterviewSchema } from '@swipe/contracts';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {return withActor(request,async client=>({slot:await client.call(workflows.cancelInterviewSlot,{p_slot:UuidSchema.parse((await context.params).id)})}));}