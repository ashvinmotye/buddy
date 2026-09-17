export const PHRASES = Object.freeze([
  'Got a minute? Buddy’s ready for a quick tax check-in.',
  'A little check-in from Buddy: how are your numbers looking?',
  'Your tax forecast is just a tap away.',
  'New income to add? Buddy’s here when you’re ready.',
  'Let’s give your forecast a quick look.',
  'Buddy popping by to say: your numbers are worth a glance.',
  'A quick update now could make your forecast clearer.',
  'Got fresh numbers? Let’s put them to work.',
  'Your PAYE picture is ready whenever you are.',
  'No spreadsheets required. Just you, Buddy, and a quick check-in.'
]);

export function mauritiusClock(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Indian/Mauritius', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  return {monthKey: `${parts.year}-${parts.month}`, day: Number(parts.day), hour: Number(parts.hour)};
}

export function shouldNotify({day, hour, monthKey}, device) {
  if (day !== 3 || ![10, 13, 16, 19, 22].includes(hour) || !device.enabled || !device.subscription) return false;
  return hour === 10 || device.month_key !== monthKey || device.has_actual !== true;
}

export function pickPhrase(lastPhrase, random = Math.random) {
  const last = Number.isInteger(lastPhrase) && lastPhrase >= 0 && lastPhrase < PHRASES.length ? lastPhrase : -1;
  const choices = PHRASES.length - (last === -1 ? 0 : 1);
  const candidate = Math.floor(random() * choices);
  return last !== -1 && candidate >= last ? candidate + 1 : candidate;
}
