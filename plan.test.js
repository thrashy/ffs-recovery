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

console.log('plan.test.js: all checks passed');
