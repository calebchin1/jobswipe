import { z } from 'zod';

/** Transport accepts timezone-qualified instants and canonicalizes them to UTC. */
export const InterviewInstantSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
export const InterviewTimeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Use a valid IANA time zone.');

/** Clock-dependent availability and overlap checks belong to the server transaction. */
export const CreateInterviewSlotSchema = z
  .object({
    startsAt: InterviewInstantSchema,
    endsAt: InterviewInstantSchema,
    timeZone: InterviewTimeZoneSchema,
  })
  .strict()
  .superRefine((slot, context) => {
    const minutes = (Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 60_000;
    if (minutes < 15 || minutes > 60)
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'Interview slots must last between 15 and 60 minutes.',
      });
  });
export type CreateInterviewSlot = z.infer<typeof CreateInterviewSlotSchema>;
export const BookInterviewSchema = z.object({ slotId: z.uuid() }).strict();
export const CancelInterviewSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();
export type BookInterview = z.infer<typeof BookInterviewSchema>;

export const InterviewSlotSchema = z.object({
  id: z.uuid(),
  jobId: z.uuid(),
  startsAt: InterviewInstantSchema,
  endsAt: InterviewInstantSchema,
  timeZone: InterviewTimeZoneSchema,
  status: z.enum(['available', 'booked', 'cancelled']),
  ownedByMe: z.boolean().optional(),
});
export type InterviewSlot = z.infer<typeof InterviewSlotSchema>;
export const ScheduledInterviewSchema = z.object({
  id: z.uuid(),
  applicationId: z.uuid(),
  jobId: z.uuid(),
  jobTitle: z.string(),
  company: z.string(),
  slotId: z.uuid().nullable(),
  startsAt: InterviewInstantSchema,
  endsAt: InterviewInstantSchema,
  timeZone: InterviewTimeZoneSchema,
  status: z.enum(['scheduled', 'cancelled', 'completed', 'disputed', 'no_show']),
  round: z.literal(1),
  isParticipant: z.boolean().optional(),
});
export type ScheduledInterview = z.infer<typeof ScheduledInterviewSchema>;
