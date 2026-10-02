import { z } from 'zod';
export const AudioSessionSchema = z.object({
  interviewId:z.uuid(), serverUrl:z.url().refine(value=>['wss:','ws:'].includes(new URL(value).protocol)),
  token:z.string().min(1), participantName:z.string(), expiresAt:z.iso.datetime(),
  audioOnly:z.literal(true), recordingEnabled:z.literal(false),
});
export type AudioSession = z.infer<typeof AudioSessionSchema>;
