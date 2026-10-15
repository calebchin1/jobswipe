import { describe, expect, it } from 'vitest';
import { LiveJobDraftSchema, ProfileDraftSchema, SignUpSchema } from './live';
import { CreateInterviewSlotSchema, ScheduledInterviewSchema } from './scheduling';
const draft={title:'Cafe assistant',description:'Help customers and organize the counter.',payMinMinor:1900,payMaxMinor:2200,payPeriod:'hour',currency:'CAD',location:'Waterloo',hoursPerWeek:20,schedule:['Mon'],skills:['Customer service'],mustHaves:['Available Mondays'],niceToHaves:[],questions:['How do you help customers?','Describe working with a team.','How do you organize a busy day?'],isVacancy:true,usesAiScreening:false,workplaceType:'restaurant_service',jobType:'Part-time'};
describe('connected write boundaries',()=>{
 it('accepts the explicit draft but rejects hidden writes and contradictory pay/age',()=>{
  expect(LiveJobDraftSchema.safeParse(draft).success).toBe(true);
  for(const extra of [{verified:true},{payMinMinor:2500},{minimumAge:18},{payMaxMinor:10000}]) expect(LiveJobDraftSchema.safeParse({...draft,...extra}).success).toBe(false);
 });
 it('blocks Canadian experience requirements from interview questions as well as requirements',()=>{
  expect(LiveJobDraftSchema.safeParse({...draft,questions:[...draft.questions,'Tell us about your Canadian work experience']}).success).toBe(false);
 });
 it('does not accept profile publication or private identity in draft writes',()=>{
  const profile={headline:'Ready to learn',educationLevel:'Secondary',field:'General',studyStatus:'Studying',bullets:[],skills:['Organization']};
  expect(ProfileDraftSchema.safeParse(profile).success).toBe(true);
  expect(ProfileDraftSchema.safeParse({...profile,school:'Example University',hoursPerWeek:18}).success).toBe(true);
  for (const hoursPerWeek of [-1,61,1.5,'18',null]) expect(ProfileDraftSchema.safeParse({...profile,hoursPerWeek}).success).toBe(false);
  expect(ProfileDraftSchema.safeParse({...profile,school:''}).success).toBe(false);
  expect(ProfileDraftSchema.safeParse({...profile,approved:true}).success).toBe(false);
  expect(ProfileDraftSchema.safeParse({...profile,dateOfBirth:'2008-01-01'}).success).toBe(false);
 });
 it('limits self-provisioned roles and password length',()=>{
  expect(SignUpSchema.safeParse({email:'a@example.invalid',password:'long-enough-password',role:'admin'}).success).toBe(false);
  expect(SignUpSchema.safeParse({email:'a@example.invalid',password:'short',role:'employer'}).success).toBe(false);
 });
});
describe('interview transport',()=>{
 it('normalizes explicit offsets and requires valid duration/timezone',()=>{
  const slot={startsAt:'2026-11-02T10:00:00-05:00',endsAt:'2026-11-02T10:30:00-05:00',timeZone:'America/Toronto'};
  expect(CreateInterviewSlotSchema.parse(slot).startsAt).toBe('2026-11-02T15:00:00.000Z');
  expect(CreateInterviewSlotSchema.safeParse({...slot,startsAt:'2026-11-02T10:00:00'}).success).toBe(false);
  expect(CreateInterviewSlotSchema.safeParse({...slot,endsAt:'2026-11-02T10:10:00-05:00'}).success).toBe(false);
  expect(CreateInterviewSlotSchema.safeParse({...slot,timeZone:'Not/A_Zone'}).success).toBe(false);
 });
 it('strips private provider details from a scheduled interview projection',()=>{
  const id='550e8400-e29b-41d4-a716-446655440000';
  const parsed=ScheduledInterviewSchema.parse({id,applicationId:id,jobId:id,jobTitle:'Role',company:'Example',slotId:id,startsAt:'2026-11-02T15:00:00Z',endsAt:'2026-11-02T15:30:00Z',timeZone:'America/Toronto',status:'scheduled',round:1,livekitRoom:'private-room',candidateName:'Hidden'});
  expect(parsed).not.toHaveProperty('candidateName');expect(parsed).not.toHaveProperty('livekitRoom');
 });
});
