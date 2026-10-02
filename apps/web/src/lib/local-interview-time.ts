/** Convert an explicitly entered browser-local wall time to a UTC instant. */
export function localInterviewTime(value: string, now = Date.now()): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Choose a complete interview date and time.');
  const date = new Date(value);
  const wallTime = (instant: Date) =>
    `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}T${String(instant.getHours()).padStart(2, '0')}:${String(instant.getMinutes()).padStart(2, '0')}`;
  if (!Number.isFinite(date.getTime()) || wallTime(date) !== value)
    throw new Error(
      'That local time does not exist. Choose another time outside the daylight-saving change.',
    );
  for (const minutes of [-120, -90, -60, -30, 30, 60, 90, 120]) {
    if (wallTime(new Date(date.getTime() + minutes * 60_000)) === value)
      throw new Error(
        'That local time occurs twice during the daylight-saving change. Choose an unambiguous time.',
      );
  }
  if (date.getTime() <= now) throw new Error('Choose an interview time in the future.');
  return date;
}

export function interviewTimeLabel(startsAt: string, endsAt: string, timeZone: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return {
    date: new Intl.DateTimeFormat('en-CA', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(start),
    range: `${new Intl.DateTimeFormat('en-CA', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(start)} – ${new Intl.DateTimeFormat('en-CA', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(end)}`,
  };
}
