// Run: node plan.test.js
const assert = require('assert');
const P = require('./plan.js');

const base = () => ({ ...P.defaultProfile(), surgeryDate: '2026-03-06', dischargeDate: '2026-03-06', arrival: '05:00' });
const ids = (p, date, id) => P.tasksFor(p, date).filter(t => t.id === id).map(t => t.slot);

// Doxycycline: first dose the evening of discharge; 7 days x 2 = 14 doses, split 7/7.
{
  const p = { ...base(), meds: { doxy: true }, doxyDays: 7 };
  const doxy = P.series(p).find(s => s.id === 'doxy');
  assert.deepStrictEqual(P.runs(doxy), [{ slot: 'breakfast', first: '2026-03-07', n: 7 }, { slot: 'dinner', first: '2026-03-06', n: 7 }]);
  assert.deepStrictEqual(ids(p, '2026-03-06', 'doxy'), ['dinner']);
  assert.deepStrictEqual(ids(p, '2026-03-13', 'doxy'), ['breakfast']);
  // Unknown course length stays open-ended instead of guessing.
  assert.strictEqual(P.series({ ...p, doxyDays: '' }).find(s => s.id === 'doxy').count, null);
}

// Dexamethasone follows the grid from the discharge day; crossed-out doses are skipped.
{
  const p = { ...base(), meds: { dex: true }, dex: [[false, false, true], [true, false, true], [true, false, false]] };
  const dex = d => P.tasksFor(p, d).filter(t => t.id.startsWith('dex')).map(t => t.slot);
  assert.deepStrictEqual(dex('2026-03-06'), ['dinner']);
  assert.deepStrictEqual(dex('2026-03-07'), ['breakfast', 'dinner']);
  assert.deepStrictEqual(dex('2026-03-08'), ['breakfast']);
  assert.deepStrictEqual(dex('2026-03-09'), []);
}

// Fasting cutoffs for a 5:00 arrival: last meal 23:00 the night before, liquids until 03:00.
{
  assert.strictEqual(P.tasksFor(base(), '2026-03-05').find(t => t.id === 'solids').time, '23:00');
  assert.deepStrictEqual(P.tasksFor(base(), '2026-03-06').slice(0, 2).map(t => t.id), ['liquids', 'arrive']);
}

// Oral care: going home on surgery day starts at bedtime; the 2 weeks end 13 days after surgery.
{
  const p = { ...base(), care: { oral: true } };
  assert.deepStrictEqual(ids(p, '2026-03-06', 'chx'), ['bedtime']);
  assert.deepStrictEqual(ids(p, '2026-03-19', 'chx'), ['breakfast', 'bedtime']);
  assert.deepStrictEqual(ids(p, '2026-03-20', 'chx'), []);
  // Overnight stay: starts with breakfast on the discharge day.
  assert.deepStrictEqual(ids({ ...p, dischargeDate: '2026-03-07' }, '2026-03-07', 'chx'), ['breakfast', 'bedtime']);
}

// BIOCORNEUM: from 2 weeks after surgery, for 3 months.
{
  const p = base(); // on by default
  assert.deepStrictEqual(ids(p, '2026-03-19', 'gel'), []);
  assert.deepStrictEqual(ids(p, '2026-03-20', 'gel'), ['breakfast', 'bedtime']);
  assert.deepStrictEqual(ids(p, '2026-06-19', 'gel'), ['breakfast', 'bedtime']);
  assert.deepStrictEqual(ids(p, '2026-06-20', 'gel'), []);
}

// Toradol: 6-hour interval, 40 mg per 24 hours, 4 days after discharge.
{
  const p = { ...base(), meds: { toradol: true }, toradolMg: 15 };
  const h = n => P.at('2026-03-07', '08:00').getTime() + n * 36e5;
  const doses = [0, 6].map(n => ({ med: 'toradol', at: h(n), mg: 15 })); // 30 mg so far
  assert.strictEqual(P.prnStatus(p, doses, 'toradol', h(7)).next, h(24)); // a 3rd dose would make 45 mg
  assert.strictEqual(P.prnStatus(p, doses, 'toradol', h(25)).next, null);
  assert.strictEqual(P.prnStatus(p, [], 'toradol', P.at('2026-03-09', '23:00').getTime()).blocked, '');
  assert.ok(P.prnStatus(p, [], 'toradol', P.at('2026-03-10', '00:30').getTime()).blocked);
  // Tylenol: 4 hours after the last dose.
  assert.strictEqual(P.prnStatus(p, [{ med: 'tylenol', at: h(0) }], 'tylenol', h(1)).next, h(4));
}

// Calendar export: daily repeats, appointment times, CRLF, lines folded to 75 octets.
{
  const p = { ...base(), care: { oral: true, masseter: true }, appts: [{ id: 'po1', label: '1st post-op, clinic', at: '2026-03-10T10:00' }] };
  const ics = P.toICS(p);
  assert.ok(ics.includes('RRULE:FREQ=DAILY;COUNT=13')); // chlorhexidine, breakfast, 3/7 to 3/19
  assert.ok(ics.includes('DTSTART:20260310T100000'));
  assert.ok(ics.includes('SUMMARY:1st post-op\\, clinic'));
  assert.ok(!ics.includes('jaw-ex')); // hourly reminders are opt-in
  assert.strictEqual(P.toICS(p, { hourly: true }).split('UID:jaw-ex').length - 1, 13); // 09:00 to 21:00
  const lines = ics.split('\r\n');
  assert.ok(lines.every(l => Buffer.byteLength(l) <= 75));
  assert.strictEqual(lines.filter(l => l === 'BEGIN:VEVENT').length, lines.filter(l => l === 'END:VEVENT').length);
}

// As-needed reminder: one event at the next-dose moment (UTC, so a time-zone change can't move it), and a
// Google link for the same slot. prnStatus rounds up to the minute so the alert never comes early.
{
  const dose = P.at('2026-03-07', '10:31').getTime() + 59e3; // logged at 10:31:59
  const ms = P.prnStatus(base(), [{ med: 'tylenol', at: dose }], 'tylenol', dose).next;
  assert.strictEqual(ms, P.at('2026-03-07', '14:32').getTime());
  const z = new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const ics = P.reminderICS('tylenol', ms);
  assert.strictEqual(ics.split('BEGIN:VEVENT').length - 1, 1);
  assert.ok(ics.includes(`DTSTART:${z}`) && z.endsWith('Z') && ics.includes('TRIGGER:PT0S'));
  assert.ok(!ics.includes('X-WR-CALNAME') && P.toICS(base()).includes('X-WR-CALNAME:Recovery plan'));
  assert.ok(ics.split('\r\n').every(l => Buffer.byteLength(l) <= 75));
  const url = new URL(P.reminderURL('tylenol', ms));
  assert.strictEqual(url.searchParams.get('action'), 'TEMPLATE');
  assert.strictEqual(url.searchParams.get('dates'), `${z}/${new Date(ms + 5 * 6e4).toISOString().replace(/[-:]|\.\d{3}/g, '')}`);
  assert.ok(url.searchParams.get('text').startsWith('Tylenol: next dose allowed from'));
}

// A discharge date before surgery (e.g. surgery moved later) is treated as same-day, never as earlier.
{
  const p = { ...base(), dischargeDate: '2026-02-20', meds: { doxy: true, toradol: true }, doxyDays: 7 };
  assert.strictEqual(P.discharge(p), '2026-03-06');
  assert.deepStrictEqual(ids(p, '2026-02-20', 'doxy'), []);
  assert.deepStrictEqual(ids(p, '2026-03-06', 'doxy'), ['dinner']);
  assert.deepStrictEqual(P.prnFor(p, '2026-03-05'), []);
  assert.strictEqual(P.prnStatus(p, [], 'toradol', P.at('2026-03-06', '20:00').getTime()).blocked, '');
}

// A bedtime after midnight belongs to the evening before: exported on the next calendar date.
{
  const p = { ...base(), meds: { valium: true }, care: { oral: true, masseter: true } };
  p.times = { ...p.times, bedtime: '01:30' };
  const ics = P.toICS(p, { hourly: true }).replace(/\r\n /g, '');
  const start = uid => ics.split('BEGIN:VEVENT').find(e => e.includes(`UID:${uid}@`)).match(/DTSTART:(\S+)/)[1];
  assert.strictEqual(start('valium-pre-bedtime-0130'), '20260306T013000'); // night of 3/5, before surgery on 3/6
  assert.strictEqual(start('chx-bedtime-0130'), '20260307T013000'); // same-day discharge: first bedtime is after surgery
  assert.strictEqual(start('jaw-ex-breakfast-0000'), '20260308T000000'); // midnight after the first exercise day (3/7)
  assert.strictEqual(P.timeline(p).find(e => e.title.startsWith('Valium')).date, '2026-03-06');
}

// The BIOCORNEUM and Diet switches are authoritative.
{
  const p = { ...base(), care: { scarGel: false, scalp: true, oral: true, diet: false } };
  assert.deepStrictEqual(ids(p, '2026-03-20', 'gel'), []);
  assert.ok(!P.rulesFor(p, '2026-03-07').some(r => r.id === 'diet' || r.id === 'sun'));
}

// Rounding up to the minute can't push the next Toradol dose past the 4-day limit unnoticed.
{
  const p = { ...base(), meds: { toradol: true } }; // discharged 3/6: last day 3/9
  const dose = P.at('2026-03-09', '17:59').getTime() + 30e3;
  const st = P.prnStatus(p, [{ med: 'toradol', at: dose, mg: 10 }], 'toradol', dose + 6e4);
  assert.ok(st.blocked);
}

console.log('plan.test.js: all checks passed');
