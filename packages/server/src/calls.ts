import { z } from 'zod';
import { AccessToken, RoomConfiguration, TrackSource, RoomServiceClient, ServerError } from 'livekit-server-sdk';
import type { AudioSession } from '@swipe/contracts';
import { ApiFailure, workflows, type RpcClient } from './index';

export const CallAccessSchema=z.object({
  interviewId:z.uuid(),roomName:z.uuid(),participantIdentity:z.uuid(),
  participantName:z.string().regex(/^(Candidate(?: [A-F0-9]{8})?|Interviewer)$/),
  joinClosesAt:z.iso.datetime({offset:true}),
});
export type CallAccess=z.infer<typeof CallAccessSchema>;
export function livekitConfig(env:Record<string,string|undefined>=process.env) {
  const {LIVEKIT_URL:url,LIVEKIT_API_KEY:apiKey,LIVEKIT_API_SECRET:apiSecret}=env;
  if (!url||!apiKey||!apiSecret) throw new ApiFailure(503,'CALLS_NOT_CONFIGURED','Audio interviews are not connected yet. Your booking is still saved.');
  let parsed:URL;
  try {parsed=new URL(url);} catch {throw new ApiFailure(503,'CALLS_NOT_CONFIGURED','Audio service configuration is unavailable.');}
  if(parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'||!(parsed.protocol==='wss:'||(parsed.protocol==='ws:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))) throw new ApiFailure(503,'CALLS_NOT_CONFIGURED','Audio service configuration is unavailable.');
  return {url:parsed.origin,apiKey,apiSecret};
}
/** Called only with an RPC-authorized entitlement; no client-supplied participant/room claims. */
export async function createAudioSession(access:CallAccess,config=livekitConfig()):Promise<AudioSession> {
  const valid=CallAccessSchema.parse(access);
  const ttl=Math.min(60,Math.floor((Date.parse(valid.joinClosesAt)-Date.now())/1000));
  if(ttl<1) throw new ApiFailure(409,'JOIN_WINDOW_CLOSED','The joining window has closed.');
  const grant=new AccessToken(config.apiKey,config.apiSecret,{identity:valid.participantIdentity,name:valid.participantName,ttl});
  grant.addGrant({room:`interview-${valid.roomName}`,roomJoin:true,roomCreate:false,roomList:false,roomAdmin:false,roomRecord:false,ingressAdmin:false,canPublish:true,canSubscribe:true,canPublishSources:[TrackSource.MICROPHONE],canPublishData:false,canUpdateOwnMetadata:false});
  grant.roomConfig=new RoomConfiguration({maxParticipants:2,emptyTimeout:300,departureTimeout:20});
  return {interviewId:valid.interviewId,serverUrl:config.url,token:await grant.toJwt(),participantName:valid.participantName,expiresAt:new Date(Date.now()+ttl*1000).toISOString(),audioOnly:true,recordingEnabled:false};
}

/** Cancellation is already committed. A provider outage must not undo withdrawal. */
export async function closeCancelledCalls(client:RpcClient,applicationId:string):Promise<'closed'|'pending'|'not_configured'> {
  let config:ReturnType<typeof livekitConfig>;
  try {config=livekitConfig();} catch {return 'not_configured';}
  try {
    const rooms=await client.call(workflows.cancelledCallRooms,{p_application:applicationId}) as string[];
    const service=new RoomServiceClient(config.url.replace(/^ws/,'http'),config.apiKey,config.apiSecret,{requestTimeout:3,failover:false});
    const outcomes=await Promise.allSettled(rooms.map(async room=>{
      try {await service.deleteRoom(`interview-${room}`);} catch(error) {if(!(error instanceof ServerError&&error.code==='not_found')) throw error;}
    }));
    return outcomes.some(result=>result.status==='rejected')?'pending':'closed';
  } catch { return 'pending'; }
}
