import { withActor } from '../../../../../../src/server/session';
import { UuidSchema } from '@swipe/contracts';
import { createAudioSession, livekitConfig, workflows } from '@swipe/server';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {return withActor(request,async client=>{
 const config=livekitConfig();
 const access=await client.call(workflows.interviewCallAccess,{p_interview:UuidSchema.parse((await context.params).id)});
 return {session:await createAudioSession(access as Parameters<typeof createAudioSession>[0],config)};
});}
