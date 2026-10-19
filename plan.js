/* Recovery Companion — schedule logic, no DOM. Used by app.js and plan.test.js.
   Instructions are transcribed from the clinic's Medication Guide and
   Post-Operative Care Instructions sheets. */
(function (root) {
  'use strict';

  // ---- local dates as 'YYYY-MM-DD' ----
  const pad = n => String(n).padStart(2, '0');
  const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + n); return iso(d); };
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
  const at = (s, hhmm) => { const d = toDate(s); const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m); return d; };
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function addMonths(s, n) { // clamps: Jan 31 + 1 month = Feb 28
    const d = toDate(s), day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    return iso(d);
  }

  const SLOT_LABEL = { breakfast: 'After breakfast', lunch: 'After lunch', dinner: 'After dinner', bedtime: 'Bedtime' };

  // Procedures from the clinic's FFS list; `care` = sheet boxes they pre-select.
  const PROCEDURES = [
    { id: 'forehead', name: 'Forehead reduction & contouring', care: ['scalp', 'hairWash'] },
    { id: 'hairline', name: 'Hairline lowering', care: ['scalp', 'hairWash'] },
    { id: 'brow', name: 'Brow lift', care: ['scalp', 'hairWash'] },
    { id: 'nose', name: 'Rhinoplasty', care: ['nose'] },
    { id: 'cheek', name: 'Cheek enhancement', care: [] },
    { id: 'fat', name: 'Fat transfer (grafting)', care: ['fat'] },
    { id: 'lip', name: 'Upper lip lift', care: ['lipEar'] },
    { id: 'chin', name: 'Chin recontouring (genioplasty)', care: ['oral', 'diet'] },
    { id: 'jaw', name: 'Jaw contouring', care: ['oral', 'diet'] },
    { id: 'masseter', name: 'Masseter muscle reduction', care: ['masseter'] },
    { id: 'trach', name: 'Adam’s apple reduction', care: [] },
    { id: 'otoplasty', name: 'Otoplasty', care: ['lipEar', 'earCompression'] },
    { id: 'earlobe', name: 'Earlobe reduction & reshaping', care: [] },
    { id: 'eyelid', name: 'Eyelid surgery', care: [] },
    { id: 'facelift', name: 'Facelift & neck lift', care: [] },
  ];

  // The boxes on the Post-Operative Care Instructions sheet.
  const CARE = [
    { id: 'oral', name: 'Oral care (genioplasty / jaw contouring)', note: 'Salt-water rinses, chlorhexidine mouthwash, gentle brushing.' },
    { id: 'lipEar', name: 'Upper lip lift / otoplasty incisions', note: 'Vaseline on the incisions for 2 weeks.' },
    { id: 'earCompression', name: 'Otoplasty compression garment', note: 'All day for 2 weeks, then at night until week 6.' },
    { id: 'scalp', name: 'Forehead / scalp incision', note: 'BIOCORNEUM on the visible scar from week 2.' },
    { id: 'hairWash', name: 'Hair washing', note: 'Ketoconazole 2% shampoo once you wash your own hair.' },
    { id: 'nose', name: 'Nose', note: 'Cast care, back-sleeping, glasses guard, Flonase after splints.' },
    { id: 'masseter', name: 'Masseter muscle reduction', note: 'Jaw-opening exercises every hour for 2 weeks.' },
    { id: 'fat', name: 'Fat grafting', note: 'No ice or cold compresses on grafted areas for 72 hours.' },
    { id: 'dressing', name: 'Dressings', note: 'Do not remove any dressings or bandages.' },
    { id: 'scarGel', name: 'BIOCORNEUM scar gel', note: 'Twice daily for 3 months, from 2 weeks after surgery.' },
    { id: 'skin', name: 'Skin care', note: 'Resume at 2 weeks; peeling products (retinol) at 6 weeks.' },
    { id: 'diet', name: 'Diet', note: 'Semi-liquid for 2 weeks, then dental soft foods.' },
  ];

  // The Medication Guide, in sheet order.
  const MEDS = [
    { id: 'clonidine', name: 'Catapres / Clonidine patch', what: 'Blood pressure' },
    { id: 'acyclovir', name: 'Acyclovir / Valtrex', what: 'Anti-viral' },
    { id: 'valium', name: 'Valium / Diazepam', what: 'Anti-anxiety / sleep aid' },
    { id: 'doxy', name: 'Doxycycline', what: 'Antibiotic' },
    { id: 'dex', name: 'Dexamethasone', what: 'Steroid / anti-inflammatory' },
    { id: 'xanax', name: 'Xanax XR', what: 'Anti-anxiety' },
    { id: 'tylenol', name: 'Tylenol / Acetaminophen 500 mg', what: 'Pain reliever' },
    { id: 'toradol', name: 'Toradol / Ketorolac', what: 'Pain reliever / anti-inflammatory' },
    { id: 'tramadol', name: 'Tramadol', what: 'Breakthrough pain control' },
  ];

  // As-needed medications. `every` = minimum hours between doses.
  const PRN = {
    tylenol: { name: 'Tylenol', every: 4, rule: 'Every 4 hours as needed while awake.' },
    toradol: { name: 'Toradol', every: 6, maxMg: 40, maxDays: 4, rule: 'Every 6 hours as needed, with food. No more than 40 mg in 24 hours, and no more than 4 days in total once discharged.' },
    tramadol: { name: 'Tramadol', every: 4, rule: 'If you need more pain relief: one tablet every 4–6 hours. It can cause constipation; an over-the-counter stool softener (Colace/Docusate) can help. Tell the office if it persists.' },
    valium: { name: 'Valium', rule: 'After surgery: one tablet before bedtime, as needed only.' },
    xanax: { name: 'Xanax XR', rule: 'One tablet, only if needed, the morning you are discharged. Do not crush or break it.' },
  };

  function defaultProfile() {
    return {
      surgeryDate: '', arrival: '', dischargeDate: '',
      procedures: [],
      care: { dressing: true, scarGel: true, skin: true },
      meds: {},
      dex: [[false, true, true], [true, false, true], [true, false, false]], // the printed taper
      doxyPerDay: 2, doxyDays: '', acyDays: '', toradolMg: 10, splintOff: '',
      times: { breakfast: '08:30', lunch: '12:30', dinner: '18:30', bedtime: '22:00' },
      appts: [
        { id: 'preop', label: 'Pre-op appointment', at: '' },
        { id: 'drain', label: 'Drain removal', at: '' },
        { id: 'po1', label: '1st post-op', at: '' },
        { id: 'po2', label: '2nd post-op', at: '' },
      ],
    };
  }

  const ctx = p => { const S = p.surgeryDate, D = p.dischargeDate || S; return { S, D, A: p.arrival, same: D === S, wk2: addDays(S, 13) }; };
  const beforeArrival = (p, h) => new Date(at(p.surgeryDate, p.arrival).getTime() - h * 36e5); // fasting cutoffs
  const scarGelOn = p => ['scarGel', 'scalp', 'lipEar', 'nose'].some(id => p.care[id]); // every box that mentions it
  const dietOn = p => p.care.diet || p.care.oral;
  const timeOf = (p, slot) => p.times[slot] || slot; // slot name or literal 'HH:MM'

  // A series = doses on `slots`, starting at `start` from slots[firstSlot], `count` doses in total
  // (null = open-ended, e.g. course length not entered yet).
  function series(p) {
    if (!p.surgeryDate) return [];
    const { S, D, A, same, wk2 } = ctx(p), m = p.meds, c = p.care, out = [];
    const once = (id, kind, title, detail, date, slot) => out.push({ id, kind, title, detail, start: date, slots: [slot], count: 1 });
    // Daily from `start` through `end`. Going home on surgery day skips that day's earlier slots.
    const daily = (id, kind, title, detail, slots, start, end, extra) => {
      let first = 0;
      if (start === D && same) {
        first = slots.findIndex(sl => sl === 'dinner' || sl === 'bedtime');
        if (first < 0) { start = addDays(start, 1); first = 0; }
      }
      const days = daysBetween(start, end) + 1;
      if (days > 0) out.push({ id, kind, title, detail, slots, start, firstSlot: first, count: days * slots.length - first, ...extra });
    };

    // Before surgery
    if (m.clonidine) once('clonidine', 'med', 'Apply the Clonidine (Catapres) patch',
      'On clean, dry skin on your upper right or left arm, 24 hours before surgery (or at your pre-op appointment). It lowers your blood pressure a little to minimize bleeding.',
      addDays(S, -1), A || 'breakfast');
    if (m.acyclovir) out.push({ id: 'acyclovir', kind: 'med', title: 'Acyclovir / Valtrex: 1 tablet',
      detail: 'Twice daily, starting 24 hours before surgery and continuing after it.' + (p.acyDays ? '' : ' Add the number of days from your label in My sheet.'),
      slots: ['breakfast', 'dinner'], start: addDays(S, -1), count: p.acyDays ? p.acyDays * 2 : null });
    once('prep-hair', 'prep', 'Wash your hair with Head & Shoulders shampoo', 'The night before surgery.', addDays(S, -1), 'dinner');
    once('prep-nasal', 'prep', 'Trim your nasal hair', 'Before surgery.', addDays(S, -1), 'dinner');
    once('prep-ears', 'prep', 'Clean your ears with Q-tips', 'Before surgery.', addDays(S, -1), 'dinner');
    once('prep-remove', 'prep', 'Remove all piercings, hair extensions, acrylic or gel nails, and nail polish', 'Before surgery.', addDays(S, -1), 'dinner');
    if (m.valium) once('valium-pre', 'med', 'Valium (Diazepam): 1 tablet', 'The night before surgery, to help you rest.', addDays(S, -1), 'bedtime');
    if (A) {
      const solids = beforeArrival(p, 6), liquids = beforeArrival(p, 2);
      once('solids', 'prep', 'Last light meal', 'Solids are allowed until 6 hours before arrival: a light meal only, with no fried foods, fatty foods, or meats.', iso(solids), hhmm(solids));
      once('liquids', 'prep', 'Last clear liquids', 'No more than 8 oz of clear liquids, until 2 hours before arrival.', iso(liquids), hhmm(liquids));
      once('arrive', 'appt', 'Arrive at the surgery center', '', S, A);
    }

    // Medications after surgery
    if (m.doxy) {
      const per = +p.doxyPerDay || 2, slots = [['dinner'], ['breakfast', 'dinner'], ['breakfast', 'lunch', 'dinner']][per - 1];
      out.push({ id: 'doxy', kind: 'med', title: 'Doxycycline (antibiotic)',
        detail: 'As directed on the bottle. First dose the evening you are discharged; finish the entire course.' + (p.doxyDays ? '' : ' Add the course length in My sheet.'),
        slots, start: D, firstSlot: slots.indexOf('dinner'), count: p.doxyDays ? p.doxyDays * per : null });
    }
    if (m.dex) p.dex.forEach((row, d) => row.forEach((on, j) => {
      const slot = ['breakfast', 'lunch', 'dinner'][j];
      if (on) once(`dex${d}${j}`, 'med', 'Dexamethasone: 1 tablet', `Steroid taper, day ${d + 1} of 3, ${SLOT_LABEL[slot].toLowerCase()}.`, addDays(D, d), slot);
    }));

    // Care
    if (c.oral) {
      daily('chx', 'care', 'Chlorhexidine mouthwash', 'Twice a day for 2 weeks.', ['breakfast', 'bedtime'], D, wk2);
      daily('salt', 'care', 'Salt-water rinse', 'Swish and spit after meals: 1 teaspoon of salt in a glass of warm water.', ['breakfast', 'lunch', 'dinner'], D, wk2);
    }
    if (c.lipEar) daily('vaseline', 'care', 'Vaseline on incisions', 'A thin layer, 1–2 times a day for 2 weeks.', ['breakfast'], D, wk2);
    if (c.earCompression) daily('ear-night', 'care', 'Ear compression garment for sleep', 'Weeks 2–6: wear it at night only.', ['bedtime'], addDays(S, 14), addDays(S, 41));
    if (c.masseter) daily('jaw-ex', 'care', 'Jaw-opening exercises', 'Every hour while awake: open wide and hold for 10–15 seconds, then close. Repeat 10–15 times.', ['breakfast'], D, wk2, { hourly: true });
    if (c.nose && p.splintOff) daily('flonase', 'med', 'Flonase (fluticasone): 2 sprays in each nostril', 'For one week after your splints are removed.', ['breakfast'], p.splintOff, addDays(p.splintOff, 6));
    if (scarGelOn(p)) {
      const g0 = addDays(S, 14);
      daily('gel', 'care', 'BIOCORNEUM scar gel', 'A thin layer on all incisions; let it dry, then add SPF 50+ on top.' + (c.scalp ? ' On the forehead/scalp: the visible part of the scar.' : ''),
        ['breakfast', 'bedtime'], g0, addDays(addMonths(g0, 3), -1));
    }

    for (const a of p.appts) if (a.at) once('appt-' + a.id, 'appt', a.label || 'Appointment', '', a.at.slice(0, 10), a.at.slice(11, 16));
    return out;
  }

  // Per slot: first date and number of consecutive daily doses.
  function runs(s) {
    const k = s.slots.length, off = s.firstSlot || 0;
    return s.slots.map((slot, i) => {
      const p0 = i >= off ? i : i + k; // first position this slot fills
      return { slot, first: addDays(s.start, Math.floor(p0 / k)), n: s.count == null ? null : Math.ceil((off + s.count - p0) / k) };
    }).filter(r => r.n == null || r.n > 0);
  }

  function tasksFor(p, date) {
    const out = [];
    for (const s of series(p)) for (const r of runs(s)) {
      const d = daysBetween(r.first, date);
      if (d >= 0 && (r.n == null || d < r.n)) out.push({ key: `${s.id}|${date}|${r.slot}`, id: s.id, kind: s.kind, title: s.title, detail: s.detail, slot: r.slot, time: timeOf(p, r.slot), hourly: !!s.hourly });
    }
    const key = t => (t.slot === 'bedtime' && t.time < '04:00' ? '1' : '0') + t.time; // after-midnight bedtimes sort last
    return out.sort((a, b) => key(a).localeCompare(key(b)));
  }

  // Standing instructions that apply from `from` through `to`.
  function rules(p) {
    if (!p.surgeryDate) return [];
    const { S, D, A, wk2 } = ctx(p), c = p.care, out = [];
    const rule = (id, text, from, to) => out.push({ id, text, from, to });
    if (A) {
      const when = h => beforeArrival(p, h).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      rule('fast', `Fasting: a light meal (no fried or fatty foods, no meats) until ${when(6)}, and no more than 8 oz of clear liquids until ${when(2)}.`, addDays(S, -1), S);
    } else rule('fast', 'Before surgery: a light meal (no fried or fatty foods, no meats) until 6 hours before arrival, and no more than 8 oz of clear liquids until 2 hours before. Add your arrival time in My sheet to see exact times.', addDays(S, -1), S);
    if (c.dressing) rule('dressing', 'Do not remove any dressings or bandages.', S, wk2);
    if (dietOn(p)) rule('diet', 'Semi-liquid diet for the first 2 weeks.', S, wk2);
    if (c.oral) {
      rule('brush', 'Brush gently with the soft toothbrush and avoid the gum line. Any toothpaste is fine.', S, wk2);
      rule('fingers', 'Do not put your fingers in your mouth or inspect the incisions.', S, wk2);
    }
    if (c.earCompression) rule('ear-day', 'Wear the ear compression garment all day.', S, wk2);
    if (c.hairWash) rule('keto', 'When you start washing your own hair, use ketoconazole 2% shampoo (see your prescription). Avoid areas with thick scab until it comes off on its own.', D, addDays(S, 41));
    if (c.nose) {
      rule('cast', 'Keep the cast and dressing clean and dry, and do not remove it. Avoid steam. Reinforce it with tape and replace the drip pad as needed.', S, p.splintOff ? addDays(p.splintOff, -1) : wk2);
      rule('sleep-up', 'Sleep on your back, semi-upright.', S, wk2);
      rule('sleep-back', 'Sleep on your back.', addDays(S, 14), addDays(S, 41));
      rule('blow', 'Do not blow your nose or hold in a sneeze.', S, addDays(S, 41));
      rule('glasses', 'Use the glasses guard.', S, addDays(S, 41));
      if (!p.splintOff) rule('flonase-later', 'Once your splints are out: Flonase, 2 sprays in each nostril for one week. Add the removal date in My sheet to schedule it.', D, wk2);
    }
    if (c.fat) rule('fat', 'No ice or cold compresses on areas where fat was injected (first 72 hours).', S, addDays(S, 3));
    if (c.skin) rule('peel', 'No peeling skin products, such as retinol, until 6 weeks after surgery.', addDays(S, 14), addDays(S, 41));
    if (scarGelOn(p)) rule('sun', 'Sun protection: SPF 50+ on top of BIOCORNEUM, plus hats or scarves.', addDays(S, 14), addDays(addMonths(addDays(S, 14), 3), -1));
    return out;
  }
  const rulesFor = (p, date) => rules(p).filter(r => r.from <= date && date <= r.to);

  function milestones(p) {
    if (!p.surgeryDate) return [];
    const { S, D } = ctx(p), c = p.care, out = [];
    const ms = (date, title, detail = '') => out.push({ date, title, detail });
    ms(S, 'Surgery day');
    ms(D, 'Going home', p.meds.xanax ? 'If needed, one Xanax XR tablet that morning. Do not crush or break it.' : '');
    if (p.meds.toradol) ms(addDays(D, PRN.toradol.maxDays - 1), 'Last day for Toradol', 'No more than 4 days in total once discharged.');
    if (c.fat) ms(addDays(S, 3), 'Fat grafting: the no-ice rule ends 72 hours after surgery');
    if (dietOn(p)) ms(addDays(S, 14), 'Dental soft foods are allowed', 'Noodles, flaky fish, mashed potatoes, and so on.');
    if (scarGelOn(p)) {
      const g0 = addDays(S, 14);
      ms(g0, 'Start BIOCORNEUM scar gel', 'Twice daily for 3 months, once the skin has fully healed (or when directed).');
      ms(addMonths(g0, 3), 'BIOCORNEUM course complete');
    }
    if (c.skin) {
      ms(addDays(S, 14), 'You may resume your skin care', 'Except products that cause peeling.');
      ms(addDays(S, 42), 'You may resume peeling products', 'Such as retinol.');
    }
    if (c.nose) {
      ms(addDays(S, 14), 'Nose: semi-upright sleeping ends', 'Keep sleeping on your back until 6 weeks.');
      ms(addDays(S, 42), 'Nose: 6-week precautions end', 'Back-sleeping, no nose blowing, and the glasses guard.');
    }
    if (c.earCompression) {
      ms(addDays(S, 14), 'Ear compression: nights only from now', 'Through week 6.');
      ms(addDays(S, 42), 'Ear compression period ends');
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  // Everything dated, for the Plan view.
  function timeline(p) {
    const out = [];
    for (const s of series(p)) {
      const rs = runs(s);
      if (!rs.length) continue;
      const first = rs.reduce((a, r) => (r.first < a.first || (r.first === a.first && timeOf(p, r.slot) < timeOf(p, a.slot)) ? r : a));
      const last = rs.some(r => r.n == null) ? null : rs.map(r => addDays(r.first, r.n - 1)).sort().pop();
      out.push({ date: first.first, time: s.hourly ? '' : timeOf(p, first.slot), kind: s.kind, title: s.title, detail: s.detail,
        until: s.count === 1 ? undefined : last, slots: s.hourly ? 'hourly' : s.slots });
    }
    for (const r of rules(p)) out.push({ date: r.from, kind: 'rule', title: r.text, until: r.to });
    for (const m of milestones(p)) if (m.title !== 'Surgery day') out.push({ date: m.date, kind: 'milestone', title: m.title, detail: m.detail });
    const rank = e => (e.kind === 'milestone' ? 0 : e.kind === 'rule' ? 2 : 1); // each day: milestones, timed steps, then standing rules
    return out.sort((a, b) => a.date.localeCompare(b.date) || rank(a) - rank(b) || (a.time || '').localeCompare(b.time || ''));
  }

  function prnFor(p, date) {
    if (!p.surgeryDate) return [];
    const { S, D } = ctx(p);
    return Object.keys(PRN).filter(id => p.meds[id] && (
      id === 'xanax' ? date === D :
      id === 'valium' ? date >= S :
      id === 'toradol' ? date >= D && date <= addDays(D, PRN.toradol.maxDays + 1) : // 2 extra days to show the limit
      date >= D));
  }

  // When the next dose is allowed. Times are epoch ms; next = null means "now".
  function prnStatus(p, doses, id, now = Date.now()) {
    const def = PRN[id], mine = doses.filter(d => d.med === id).sort((a, b) => a.at - b.at);
    const last = mine[mine.length - 1];
    const st = { last: last ? last.at : null, next: def.every && last ? last.at + def.every * 36e5 : null, blocked: '' };
    if (id === 'toradol') {
      const mg = +p.toradolMg || 10, recent = mine.filter(d => d.at > now - 864e5);
      st.mg24 = recent.reduce((sum, d) => sum + (d.mg || mg), 0);
      st.lastDay = addDays(ctx(p).D, def.maxDays - 1);
      let sum = st.mg24;
      for (const d of recent) { // wait for the oldest doses to leave the 24-hour window
        if (sum + mg <= def.maxMg) break;
        sum -= d.mg || mg;
        st.next = Math.max(st.next || 0, d.at + 864e5);
      }
      if (Math.max(now, st.next || 0) >= at(addDays(st.lastDay, 1), '00:00').getTime()) st.blocked = 'The 4-day Toradol limit has been reached.';
    }
    if (st.next && st.next <= now) st.next = null;
    return st;
  }

  // ---- calendar export (RFC 5545), floating local times ----
  function fold(line) { // max 75 octets per line
    let out = '', n = 0;
    for (const ch of line) {
      const cp = ch.codePointAt(0), b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (n + b > 75) { out += '\r\n '; n = 1; }
      out += ch; n += b;
    }
    return out;
  }
  function awakeHours(p) { // on the hour, from after breakfast until before bed
    const [bh, bm] = p.times.breakfast.split(':').map(Number), start = bh + (bm ? 1 : 0);
    let end = +p.times.bedtime.slice(0, 2);
    if (end <= start) end += 24;
    const out = [];
    for (let h = start; h < end; h++) out.push(pad(h % 24) + ':00');
    return out;
  }
  function toICS(p, opts = {}) {
    const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    const esc = t => String(t).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
    const dt = (date, t, plusMin = 0) => { const d = at(date, t); d.setMinutes(d.getMinutes() + plusMin); return iso(d).replace(/-/g, '') + 'T' + hhmm(d).replace(':', '') + '00'; };
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Recovery Companion//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Recovery plan'];
    const event = (uid, when, summary, detail, alarms, rrule) => L.push('BEGIN:VEVENT', `UID:${uid}@recovery-companion`, `DTSTAMP:${stamp}`, ...when,
      ...(rrule ? [rrule] : []), `SUMMARY:${esc(summary)}`, ...(detail ? [`DESCRIPTION:${esc(detail)}`] : []),
      ...alarms.flatMap(a => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, `TRIGGER:${a}`, 'END:VALARM']), 'END:VEVENT');
    for (const s of series(p)) {
      if (s.hourly && !opts.hourly) continue;
      const appt = s.kind === 'appt';
      for (const r of runs(s)) {
        if (r.n == null) continue; // open-ended courses need a length first
        for (const t of s.hourly ? awakeHours(p) : [timeOf(p, r.slot)]) {
          event(`${s.id}-${r.slot}-${t.replace(':', '')}`, [`DTSTART:${dt(r.first, t)}`, `DTEND:${dt(r.first, t, appt ? 60 : 15)}`],
            s.title, s.detail, appt ? ['-P1D', '-PT1H'] : ['PT0S'], r.n > 1 ? `RRULE:FREQ=DAILY;COUNT=${r.n}` : '');
        }
      }
    }
    for (const m of milestones(p)) {
      event(`ms-${m.date}-${m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        [`DTSTART;VALUE=DATE:${m.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(m.date, 1).replace(/-/g, '')}`], m.title, m.detail, ['PT9H']);
    }
    L.push('END:VCALENDAR');
    return L.map(fold).join('\r\n') + '\r\n';
  }

  const api = { SLOT_LABEL, PROCEDURES, CARE, MEDS, PRN, defaultProfile, series, runs, tasksFor, rules, rulesFor, milestones, timeline, prnFor, prnStatus, toICS, iso, at, addDays, daysBetween };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Plan = api;
})(this);
