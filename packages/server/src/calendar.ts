import type { ScheduledInterview } from '@swipe/contracts';

function escape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
function instant(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
/** RFC5545 folding counts UTF-8 octets, not JavaScript code units. */
function fold(line: string): string {
  const lines: string[]=[];
  let current='';let count=0;
  for (const character of line) {
    const size=Buffer.byteLength(character,'utf8');
    if(count+size>75) {lines.push(current);current=' ';count=1;}
    current+=character;count+=size;
  }
  lines.push(current);
  return lines.join('\r\n');
}
/** No candidate identities, email attendees, room names, or access tokens in calendar files. */
export function interviewCalendar(interview: ScheduledInterview, generatedAt = new Date()): string {
  const cancelled=interview.status==='cancelled';
  const lines=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Swipe-to-Hire//Blind Interview//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'BEGIN:VEVENT',`UID:${interview.id}@interviews.example.invalid`,`DTSTAMP:${instant(generatedAt.toISOString())}`,
    `DTSTART:${instant(interview.startsAt)}`,`DTEND:${instant(interview.endsAt)}`,
    `SUMMARY:${escape(`Blind audio interview: ${interview.jobTitle}`)}`,
    `DESCRIPTION:${escape(`${interview.company}. First interview is audio only. Check the app for current status and joining details. Calendar downloads do not update automatically.`)}`,
    `STATUS:${cancelled?'CANCELLED':'CONFIRMED'}`,'TRANSP:OPAQUE','END:VEVENT','END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
