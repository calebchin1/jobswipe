import { expect,it } from 'vitest';
import { interviewCalendar } from './calendar';
import type { ScheduledInterview } from '@swipe/contracts';
const base:ScheduledInterview={id:'550e8400-e29b-41d4-a716-446655440000',applicationId:'550e8400-e29b-41d4-a716-446655440001',jobId:'550e8400-e29b-41d4-a716-446655440002',slotId:null,jobTitle:'Café assistant',company:'Example Store',startsAt:'2026-11-02T10:00:00-05:00',endsAt:'2026-11-02T10:30:00-05:00',timeZone:'America/Toronto',status:'scheduled',round:1};
it('exports UTC event times without attendees or identifying metadata',()=>{
 const ics=interviewCalendar(base,new Date('2026-09-29T00:00:00Z'));
 expect(ics).toContain('DTSTART:20261102T150000Z\r\n');expect(ics).toContain('DTEND:20261102T153000Z\r\n');expect(ics).toContain('DTSTAMP:20260929T000000Z\r\n');expect(ics).not.toContain('ATTENDEE');
 expect(interviewCalendar({...base,status:'cancelled'})).toContain('STATUS:CANCELLED');
});
it('escapes event injection and folds unicode safely by octet length',()=>{
 const title='é'.repeat(80)+'\r\nATTENDEE:mailto:leak@example.invalid,;\\';
 const ics=interviewCalendar({...base,jobTitle:title});
 expect(ics.split('\r\n').every(line=>Buffer.byteLength(line)<=75)).toBe(true);
 const unfolded=ics.replace(/\r\n /g,'');
 expect(unfolded).toContain('\\nATTENDEE:');expect(unfolded).not.toContain('\r\nATTENDEE:');expect(unfolded).toContain('\\,\\;\\\\');
 expect(unfolded).toContain('é'.repeat(80));
});
