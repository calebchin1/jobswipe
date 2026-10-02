import { describe,expect,it } from 'vitest';
import { TokenVerifier } from 'livekit-server-sdk';
import { createAudioSession,livekitConfig } from './calls';
const id='550e8400-e29b-41d4-a716-446655440000';
const access={interviewId:id,roomName:id,participantIdentity:'550e8400-e29b-41d4-a716-446655440001',participantName:'Candidate ABCD1234',joinClosesAt:new Date(Date.now()+600000).toISOString()};
const config={url:'wss://test.example.invalid',apiKey:'synthetic-key',apiSecret:'synthetic-secret-long-enough-for-test-only'};
describe('audio grants',()=>{
 it('requires configured secure provider and never permits credentials in URL',()=>{
  expect(()=>livekitConfig({})).toThrow();
  for(const url of ['https://test.invalid','ws://public.invalid','wss://user:pass@test.invalid','wss://test.invalid/path']) expect(()=>livekitConfig({LIVEKIT_URL:url,LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'})).toThrow();
  expect(livekitConfig({LIVEKIT_URL:'ws://127.0.0.1:7880',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'}).url).toBe('ws://127.0.0.1:7880');
 });
 it('signs opaque microphone-only grants without data, metadata updates or administrative powers',async()=>{
  const result=await createAudioSession(access,config);
  const decoded=await new TokenVerifier(config.apiKey,config.apiSecret).verify(result.token);
  expect(decoded.sub).toBe(access.participantIdentity);
  expect(decoded.name).toBe(access.participantName);
  expect(decoded.video).toMatchObject({room:`interview-${id}`,roomJoin:true,canPublishSources:['microphone'],canPublishData:false,canUpdateOwnMetadata:false,roomAdmin:false,roomRecord:false,roomCreate:false,roomList:false});
  expect(decoded.roomConfig?.maxParticipants).toBe(2);
  expect(decoded.exp! - Math.floor(Date.now()/1000)).toBeLessThanOrEqual(60);
  expect(result).not.toHaveProperty('apiSecret');
 });
 it('rejects expired entitlements and names outside the approved anonymous labels',async()=>{
  await expect(createAudioSession({...access,joinClosesAt:'2020-01-01T00:00:00Z'},config)).rejects.toThrow();
  await expect(createAudioSession({...access,participantName:'Alex Example'},config)).rejects.toThrow();
 });
});
