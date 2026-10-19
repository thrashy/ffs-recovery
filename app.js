/* Recovery Companion — UI. Data stays in this browser (localStorage); schedule logic is in plan.js. */
(function () {
  'use strict';
  const P = window.Plan;
  const KEY = 'recovery-companion-v1';
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const icon = id => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const KIND = { med: ['pill', 'Medication'], care: ['droplet', 'Care'], prep: ['clipboard', 'Prep'], appt: ['calendar', 'Appointment'], rule: ['info', 'Instruction'], milestone: ['flag', 'Milestone'] };

  // "What's Inside" on the care sheet.
  const KIT = [
    ['cepacol', 'Cepacol', 'Throat lozenges'], ['chapstick', 'Chapstick', 'Lip balm'],
    ['toothbrush', 'Toothbrush', 'Soft, for gentle brushing'], ['orajel', 'Orajel', 'Oral numbing gel'],
    ['xylimelts', 'XyliMelts', 'Dry-mouth discs'], ['biocorneum', 'BIOCORNEUM scar gel', 'Silicone scar gel with sunscreen'],
    ['glasses', 'Eyeglasses support', 'The glasses guard'], ['gauze', '2×2 gauze and tape', 'Drip pads and reinforcing tape'],
    ['qtips', 'Q-tips', ''], ['vaseline', 'Vaseline ointment', 'For lip and ear incisions'],
    ['ears', 'Compression (ears)', 'Otoplasty garment'], ['chin', 'Compression (chin/jaw)', 'Chin and jaw garment'],
  ];
  // Summarized from deschamps-braly.com (Facial Feminization, Post-Op Maintenance, Recovery Protocol pages).
  const EXPECT = [
    ['First night', 'Patients typically spend the first night in the hospital, and Dr. Deschamps-Braly checks in the next morning.'],
    ['First 48 hours', 'A critical time, with regular check-ins from the clinical team in person and through your care coordinator.'],
    ['About 1 week', 'Most swelling and bruising resolves within about 7 days.'],
    ['About 2 weeks', 'Traveling patients are advised to stay in San Francisco for about two weeks. Flying too soon raises the risk of blood clots.'],
    ['2 to 4 weeks', 'Facial hair removal, vigorous exercise, and heavy lifting are typically paused for at least 2–4 weeks, or until you are cleared.'],
    ['3 to 4 weeks', 'Most people have a full recovery and can resume usual activities and wear makeup. Final results from some procedures take several months.'],
  ];
  const TIPS = [
    'Sleep with your head elevated for several days.',
    'Use cold compresses as directed in the first few days, but never on fat-grafted areas during the first 72 hours.',
    'Eat soft or liquid foods, and avoid spicy, hot, or cold items after jaw or facial surgery.',
    'Avoid excess sun and strenuous activity until your surgical team clears you.',
  ];
  const WHEN_TO_START = 'When to start: if you stayed overnight, the nursing staff will tell you whether to begin with Tylenol or Toradol when you get home. Follow their instructions carefully. If you went home the same day, the office will email you instructions.';

  let state = load();
  let viewDate = P.iso(new Date());
  let icsHourly = false;
  let blobs = []; // calendar-file URLs made by the current render

  // Calendar files go in real links the user taps: iPhone Safari only hands a generated file to Calendar that way.
  function calendarFile(text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    blobs.push(url);
    return url;
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.profile) return { done: {}, count: {}, doses: [], kit: {}, ...s, profile: { ...P.defaultProfile(), ...s.profile } };
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return { profile: P.defaultProfile(), done: {}, count: {}, doses: [], kit: {} };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Your browser is blocking storage, so changes will not be kept.'); }
  }

  // ---- formatting ----
  const fmtDate = (d, o = { weekday: 'short', month: 'short', day: 'numeric' }) => P.at(d, '12:00').toLocaleDateString(undefined, o);
  const fmtTime = t => P.at('2000-01-01', t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const clock = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = ms => (P.iso(new Date(ms)) === P.iso(new Date()) ? '' : fmtDate(P.iso(new Date(ms))) + ', ') + clock(ms);
  const fmtIn = ms => { const m = Math.max(1, Math.round((ms - Date.now()) / 6e4)), h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };
  function dayLabel(date) {
    const n = P.daysBetween(state.profile.surgeryDate, date);
    return n < -1 ? `Surgery in ${-n} days` : n === -1 ? 'Surgery tomorrow' : n === 0 ? 'Surgery day' : `Day ${n} after surgery`;
  }

  // ---- views ----
  function welcome() {
    return `
      <section class="hero welcome">
        <p class="eyebrow">For facial feminization surgery patients</p>
        <h1 class="display xl">Your recovery, <em>one day at a time.</em></h1>
        <p class="lede">Turn your Medication Guide and Post-Operative Care Instructions into a simple daily checklist, with timers for as-needed pain medication, your appointments, and reminders for your phone’s calendar.</p>
        <a class="pill" href="#setup">Set up my plan<span class="dot">${icon('arrow-up-right')}</span></a>
      </section>
      <ul class="features">
        <li>${icon('list')}<h2>Today’s checklist</h2><p>Every dose and care step in order, ticked off as you go.</p></li>
        <li>${icon('clock')}<h2>As-needed timers</h2><p>See when your next Tylenol, Toradol, or Tramadol is allowed, and get a phone reminder.</p></li>
        <li>${icon('calendar')}<h2>Calendar reminders</h2><p>Add your whole plan, with alarms, to Apple or Google Calendar.</p></li>
      </ul>
      <aside class="notice big">${icon('info')}<p><strong>Unofficial and private.</strong> This is an independent tool made by a patient. It is not affiliated with or endorsed by the Deschamps-Braly Clinic, and it does not give medical advice. Always follow your care team’s instructions. Everything you enter stays on this device.</p></aside>`;
  }

  function today() {
    const p = state.profile, d = viewDate, isToday = d === P.iso(new Date());
    const tasks = P.tasksFor(p, d).sort((a, b) => b.hourly - a.hourly);
    const checkable = tasks.filter(t => !t.hourly), done = checkable.filter(t => state.done[t.key]).length;
    const groups = new Map();
    for (const t of tasks) {
      const g = t.hourly ? 'Throughout the day' : P.SLOT_LABEL[t.slot] ? `${P.SLOT_LABEL[t.slot]} · ${fmtTime(t.time)}` : fmtTime(t.time);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(t);
    }
    const ms = P.milestones(p).filter(m => m.date === d && m.title !== 'Surgery day');
    const rules = P.rulesFor(p, d), prn = isToday ? P.prnFor(p, d) : [];
    const logged = isToday ? [] : state.doses.filter(x => P.iso(new Date(x.at)) === d).sort((a, b) => a.at - b.at);
    const appt = isToday && nextAppt();
    const D = p.dischargeDate || p.surgeryDate;
    return `
      <section class="hero">
        <p class="eyebrow">${esc(dayLabel(d))}</p>
        <h1 class="display">${esc(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }))}</h1>
        <div class="daynav">
          <button class="iconbtn" type="button" data-act="day" data-n="-1" data-focus="prev" aria-label="Previous day">${icon('chevron-left')}</button>
          ${isToday ? '<span class="today-pill">Today</span>' : '<button class="link" type="button" data-act="today" data-focus="back">Back to today</button>'}
          <button class="iconbtn" type="button" data-act="day" data-n="1" data-focus="next" aria-label="Next day">${icon('chevron-right')}</button>
        </div>
        ${checkable.length ? `<div class="progress"><div class="bar" style="--w:${Math.round(done / checkable.length * 100)}%"></div>${done} of ${checkable.length} done</div>` : ''}
      </section>
      ${ms.map(m => `<p class="notice">${icon('flag')}<span><strong>${esc(m.title)}</strong>${m.detail ? `. ${esc(m.detail)}` : ''}</span></p>`).join('')}
      ${tasks.length ? [...groups].map(([g, ts]) => `<section class="group"><h2 class="group-title">${esc(g)}</h2>${ts.map(taskRow).join('')}</section>`).join('')
        : `<p class="empty">Nothing scheduled ${isToday ? 'today' : 'on this day'}.</p>`}
      ${prn.length ? `<section class="block"><h2 class="label">As needed</h2>
        ${d <= P.addDays(D, 1) && (prn.includes('tylenol') || prn.includes('toradol')) ? `<p class="hint">${esc(WHEN_TO_START)}</p>` : ''}
        <div class="prn-grid">${prn.map(prnCard).join('')}</div></section>` : ''}
      ${logged.length ? `<section class="block"><h2 class="label">As-needed doses logged</h2><ul class="rules">${logged.map(x => `<li>${icon('pill')}<span>${esc(P.PRN[x.med].name)} at ${esc(clock(x.at))}</span></li>`).join('')}</ul></section>` : ''}
      ${rules.length ? `<section class="block"><h2 class="label">Keep in mind</h2><ul class="rules">${rules.map(r => `<li>${icon('info')}<span>${esc(r.text)}</span></li>`).join('')}</ul></section>` : ''}
      ${appt ? `<section class="block"><h2 class="label">Next appointment</h2><div class="card appt">${icon('calendar')}<div>
        <p class="title">${esc(appt.label || 'Appointment')}</p>
        <p class="detail">${esc(fmtDate(appt.at.slice(0, 10), { weekday: 'long', month: 'long', day: 'numeric' }))} · ${esc(fmtTime(appt.at.slice(11, 16)))}</p></div></div></section>` : ''}`;
  }

  function taskRow(t) {
    const [ic, kind] = KIND[t.kind], head = `<span class="kind">${icon(ic)}${kind}</span><span class="title">${esc(t.title)}</span>`;
    if (t.hourly) {
      const n = state.count[t.key] || 0;
      return `<div class="task"><span class="body">${head}<span class="detail">${esc(t.detail)}</span></span>
        <span class="counter">
          <button class="iconbtn" type="button" data-act="sets" data-key="${esc(t.key)}" data-n="-1" data-focus="sets-minus" aria-label="Remove a set"${n ? '' : ' disabled'}>${icon('minus')}</button>
          <output aria-live="polite"><strong>${n}</strong> ${n === 1 ? 'set' : 'sets'}</output>
          <button class="iconbtn solid" type="button" data-act="sets" data-key="${esc(t.key)}" data-n="1" data-focus="sets-plus" aria-label="Log a set">${icon('plus')}</button>
        </span></div>`;
    }
    const at = state.done[t.key];
    return `<label class="task${at ? ' is-done' : ''}">
      <input class="check" type="checkbox" data-act="task" data-key="${esc(t.key)}" data-focus="${esc(t.key)}"${at ? ' checked' : ''}>
      <span class="body">${head}${t.detail ? `<span class="detail">${esc(t.detail)}</span>` : ''}${at ? `<span class="stamp">Done ${esc(fmtWhen(at))}</span>` : ''}</span>
    </label>`;
  }

  function prnCard(id) {
    const def = P.PRN[id], st = P.prnStatus(state.profile, state.doses, id);
    const recent = state.doses.filter(x => x.med === id && x.at > Date.now() - 864e5).sort((a, b) => a.at - b.at);
    let status = '';
    if (st.blocked) status = `<p class="status warn">${icon('alert')}<span>${esc(st.blocked)}</span></p>`;
    else if (st.next) status = `<p class="status">${icon('clock')}<span>Next dose from <strong>${esc(fmtWhen(st.next))}</strong> (in ${fmtIn(st.next)})</span></p>`;
    else if (def.every) status = `<p class="status ok">${icon('check')}<span>${st.last ? 'The next dose is allowed now' : 'No doses logged yet'}</span></p>`;
    else if (st.last) status = `<p class="status">${icon('clock')}<span>Last taken ${esc(fmtWhen(st.last))}</span></p>`;
    return `<article class="card prn">
      <h3>${esc(def.name)}</h3>
      <p class="detail">${esc(def.rule)}</p>
      ${status}
      ${id === 'toradol' ? `<p class="meta">${st.mg24} of 40 mg in the last 24 hours · last day ${esc(fmtDate(st.lastDay))}</p>` : ''}
      ${st.next && !st.blocked ? `<div class="remind"><p>${icon('bell')}Remind me at ${esc(clock(st.next))}</p>
        <a href="${calendarFile(P.reminderICS(id, st.next))}" download="${id}-next-dose.ics">Apple Calendar</a>
        <a href="${esc(P.reminderURL(id, st.next))}" target="_blank" rel="noopener">Google Calendar</a></div>` : ''}
      ${recent.length ? `<ul class="doses" aria-label="Doses in the last 24 hours">${recent.map(x => `<li>${esc(fmtWhen(x.at))}<button type="button" class="x" data-act="undose" data-id="${esc(x.id)}" aria-label="Remove the ${esc(fmtWhen(x.at))} dose">${icon('x')}</button></li>`).join('')}</ul>` : ''}
      <div class="prn-actions">
        <button type="button" class="btn${!st.blocked && !st.next ? '' : ' ghost'}" data-act="dose" data-med="${id}" data-focus="dose-${id}">Log a dose now</button>
        <details><summary>Took it earlier?</summary>
          <div class="row"><input type="datetime-local" id="when-${id}" aria-label="When you took ${esc(def.name)}"><button type="button" class="btn ghost" data-act="dose" data-med="${id}" data-when="when-${id}">Log</button></div>
        </details>
      </div>
    </article>`;
  }

  function nextAppt() {
    const p = state.profile, list = p.appts.filter(a => a.at);
    if (p.arrival) list.push({ label: 'Arrive at the surgery center', at: `${p.surgeryDate}T${p.arrival}` });
    return list.filter(a => new Date(a.at).getTime() > Date.now() - 36e5).sort((a, b) => a.at.localeCompare(b.at))[0];
  }

  function plan() {
    const p = state.profile, S = p.surgeryDate, entries = P.timeline(p);
    const phases = [['Before surgery', -Infinity, -1], ['Surgery day', 0, 0], ['The first two weeks', 1, 13], ['Weeks 3 to 6', 14, 41], ['To three months', 42, Infinity]];
    const open = P.series(p).filter(s => s.count == null).map(s => s.title.split(/[:(]/)[0].trim());
    return `
      <section class="hero">
        <p class="eyebrow">Your plan · Surgery ${esc(fmtDate(S, { weekday: 'short', month: 'long', day: 'numeric' }))}</p>
        <h1 class="display">Every step, <em>from prep to three months.</em></h1>
        <div class="actions">
          <a class="pill" href="${calendarFile(P.toICS(p, { hourly: icsHourly }))}" download="recovery-plan.ics" data-focus="ics">Add to my calendar<span class="dot">${icon('calendar')}</span></a>
          ${p.care.masseter ? `<label class="inline"><input class="check sm" type="checkbox" data-act="hourly" data-focus="hourly"${icsHourly ? ' checked' : ''}> Include hourly jaw-exercise reminders</label>` : ''}
        </div>
        <p class="hint">A calendar file with an alarm for every step, so your phone reminds you even when this site is closed. On iPhone, open this page in Safari. Google Calendar can only import the file on a computer (calendar.google.com, then Settings, then Import).${open.length ? ` ${esc(open.join(' and '))} ${open.length > 1 ? 'are' : 'is'} left out until you add the course length in My sheet.` : ''}</p>
      </section>
      ${phases.map(([name, a, b]) => {
        const list = entries.filter(e => { const n = P.daysBetween(S, e.date); return n >= a && n <= b; });
        return list.length ? `<section class="phase"><h2>${name}</h2><ol class="entries">${list.map(entry).join('')}</ol></section>` : '';
      }).join('')}
      <section class="phase"><h2>What to expect</h2>
        <p class="hint">Summarized from the clinic’s website. This is general information; your printed instructions and care team come first.</p>
        <dl class="expect">${EXPECT.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <ul class="rules">${TIPS.map(t => `<li>${icon('info')}<span>${esc(t)}</span></li>`).join('')}</ul>
      </section>
      <section class="phase"><h2>Your recovery kit</h2>
        <p class="hint">What’s inside the kit, from your care sheet. Tick off what you have.</p>
        <div class="kit">${KIT.map(([id, name, what]) => `<label class="kit-item"><input class="check" type="checkbox" data-kit="${id}"${state.kit[id] ? ' checked' : ''}><span><span class="title">${esc(name)}</span>${what ? `<span class="detail">${esc(what)}</span>` : ''}</span></label>`).join('')}</div>
      </section>`;
  }

  function entry(e) {
    const freq = e.slots === 'hourly' ? 'hourly while awake' : e.slots && e.until !== undefined ? ['daily', 'twice daily', 'three times daily'][e.slots.length - 1] : '';
    const meta = e.until === undefined ? '' : cap([freq, e.until ? `through ${fmtDate(e.until)}` : 'until the course is finished'].filter(Boolean).join(' · '));
    return `<li class="entry k-${e.kind}">
      <p class="when">${esc(fmtDate(e.date))}${e.time ? ` · ${esc(fmtTime(e.time))}` : ''}</p>
      <p class="title">${icon(KIND[e.kind][0])}<span>${esc(e.title)}</span></p>
      ${e.detail ? `<p class="detail">${esc(e.detail)}</p>` : ''}
      ${meta ? `<p class="meta">${esc(meta)}</p>` : ''}
    </li>`;
  }

  function setup() {
    const p = state.profile, v = k => esc(p[k]);
    const field = (label, control, hint = '') => `<label class="field"><span>${label}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
    const num = (k, label, min, max, hint = '') => field(label, `<input type="number" inputmode="numeric" data-field="${k}" min="${min}" max="${max}" value="${v(k)}" placeholder="From the label">`, hint);
    const toggle = (group, x, note, on, sub) => `<div class="toggle-row">
      <label class="toggle"><span class="tbody"><span class="tname">${esc(x.name)}</span><span class="tnote">${esc(note)}</span></span><input class="switch" type="checkbox" data-${group}="${x.id}"${on ? ' checked' : ''}></label>
      ${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
    const sub = {
      acyclovir: num('acyDays', 'Total days of tablets', 1, 60, 'Read this from your prescription label.'),
      doxy: `<div class="grid2">${field('Times per day', `<select data-field="doxyPerDay">${[1, 2, 3].map(n => `<option${+p.doxyPerDay === n ? ' selected' : ''}>${n}</option>`).join('')}</select>`)}${num('doxyDays', 'Number of days', 1, 60)}</div><small class="hint">The instructions are on the prescription bottle.</small>`,
      dex: `<table class="dex"><caption>Untick any dose crossed out on your sheet. Day 1 is the day you go home.</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">After breakfast</th><th scope="col">After lunch</th><th scope="col">After dinner</th></tr></thead>
        <tbody>${p.dex.map((row, d) => `<tr><th scope="row">${d + 1}</th>${row.map((on, j) => `<td><label class="cell"><input class="check" type="checkbox" data-dex="${d},${j}" aria-label="Day ${d + 1}, ${['after breakfast', 'after lunch', 'after dinner'][j]}"${on ? ' checked' : ''}></label></td>`).join('')}</tr>`).join('')}</tbody></table>`,
      toradol: num('toradolMg', 'Milligrams per dose', 1, 40, 'Check your bottle label. Used to track the 40 mg daily limit.'),
    };
    return `
      <section class="hero">
        <p class="eyebrow">My sheet</p>
        <h1 class="display">Match the plan to <em>your instructions.</em></h1>
        <p class="lede">Have your Medication Guide and Post-Operative Care Instructions in hand. Changes save as you go, on this device only.</p>
      </section>
      <form class="setup" novalidate>
        <fieldset><legend><span class="step">01</span>Dates</legend>
          <div class="grid2">
            <div class="field"><label for="f-surgery">Surgery date</label>
              <input id="f-surgery" type="date" data-field="surgeryDate" value="${v('surgeryDate')}" required aria-describedby="err-surgery">
              <p class="err" id="err-surgery" hidden>Add your surgery date to build your plan.</p></div>
            ${field('Arrival time at the surgery center', `<input type="time" data-field="arrival" value="${v('arrival')}">`, 'Used to work out your last meal and drink.')}
            ${field('Discharge date', `<input id="f-discharge" type="date" data-field="dischargeDate" value="${v('dischargeDate')}" min="${v('surgeryDate')}">`, 'The day you go home. The antibiotic and steroid schedules start that day.')}
          </div>
        </fieldset>
        <fieldset><legend><span class="step">02</span>Procedures</legend>
          <p class="hint">Choosing a procedure turns on its care instructions below.</p>
          <div class="chips">${P.PROCEDURES.map(x => `<label class="chip"><input type="checkbox" data-proc="${x.id}"${p.procedures.includes(x.id) ? ' checked' : ''}>${icon('check')}${esc(x.name)}</label>`).join('')}</div>
        </fieldset>
        <fieldset><legend><span class="step">03</span>Care instructions</legend>
          <p class="hint">Match the boxes checked on your Post-Operative Care Instructions.</p>
          ${P.CARE.map(x => toggle('care', x, x.note, p.care[x.id], x.id === 'nose' ? field('Splint removal date', `<input type="date" data-field="splintOff" value="${v('splintOff')}">`, 'Schedules one week of Flonase.') : '')).join('')}
        </fieldset>
        <fieldset><legend><span class="step">04</span>Medications</legend>
          <p class="hint">Turn on what’s checked on your Medication Guide.</p>
          ${P.MEDS.map(x => toggle('med', x, x.what, p.meds[x.id], sub[x.id])).join('')}
        </fieldset>
        <fieldset><legend><span class="step">05</span>Appointments</legend>
          <div class="appts">${p.appts.map(apptRow).join('')}</div>
          <div><button type="button" class="btn ghost" data-act="add-appt" data-focus="add-appt">${icon('plus')}Add an appointment</button></div>
        </fieldset>
        <fieldset><legend><span class="step">06</span>Daily routine</legend>
          <p class="hint">The times used for doses taken after meals and at bedtime.</p>
          <div class="grid4">${['breakfast', 'lunch', 'dinner', 'bedtime'].map(k => field(cap(k), `<input type="time" data-field="times.${k}" value="${esc(p.times[k])}" required>`)).join('')}</div>
        </fieldset>
        <div class="actions"><button type="button" class="pill" data-act="finish">Save and see today<span class="dot">${icon('arrow-up-right')}</span></button></div>
        <fieldset><legend>Your data</legend>
          <p class="hint">Everything is stored in this browser only. Erasing it can’t be undone.</p>
          <div><button type="button" class="btn ghost" data-act="reset">Erase all my data</button></div>
        </fieldset>
      </form>`;
  }
  const apptRow = a => `<div class="appt-row">
    <input type="text" id="al-${esc(a.id)}" data-appt="${esc(a.id)}" data-k="label" value="${esc(a.label)}" placeholder="Appointment name" aria-label="Appointment name">
    <input type="datetime-local" data-appt="${esc(a.id)}" data-k="at" value="${esc(a.at)}" aria-label="${esc(a.label || 'Appointment')}: date and time">
    <button type="button" class="iconbtn" data-act="del-appt" data-id="${esc(a.id)}" aria-label="Remove ${esc(a.label || 'appointment')}">${icon('x')}</button>
  </div>`;

  // ---- rendering ----
  const VIEWS = { welcome, today, plan, setup };
  const TITLES = { welcome: 'Welcome', today: 'Today', plan: 'Plan', setup: 'My sheet' };
  function render() {
    let view = location.hash.slice(1);
    if (!['today', 'plan', 'setup'].includes(view)) view = 'today';
    if (!state.profile.surgeryDate && view !== 'setup') view = 'welcome';
    const stale = blobs;
    blobs = [];
    setTimeout(() => stale.forEach(u => URL.revokeObjectURL(u)), 60000); // a tap on a just-replaced link still works
    const focus = document.activeElement && document.activeElement.dataset.focus, main = $('#main');
    main.innerHTML = VIEWS[view]();
    main.dataset.view = view;
    document.title = `${TITLES[view]} · Recovery Companion`;
    document.querySelectorAll('.tabs a').forEach(a => (a.hash === '#' + view ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    const el = focus && main.querySelector(`[data-focus="${CSS.escape(focus)}"]`);
    if (el) el.focus({ preventScroll: true });
  }

  let toastTimer;
  function toast(msg, undo) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button" class="link">Undo</button>' : ''}`;
    if (undo) t.querySelector('button').onclick = () => { undo(); t.innerHTML = ''; };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.innerHTML = ''; }, 7000);
  }

  function logDose(b) {
    const p = state.profile, med = b.dataset.med;
    let at = Date.now();
    if (b.dataset.when) {
      const v = document.getElementById(b.dataset.when).value;
      if (!v) return toast('Choose the time you took it first.');
      at = new Date(v).getTime();
      if (at > Date.now()) return toast('That time is in the future.');
    }
    const early = !b.dataset.when && P.prnStatus(p, state.doses, med).next;
    const dose = { id: Math.random().toString(36).slice(2, 10), med, at };
    if (med === 'toradol') dose.mg = +p.toradolMg || 10;
    state.doses.push(dose);
    save(); render();
    toast(`${P.PRN[med].name} logged at ${clock(at)}.${early ? ' That is sooner than the usual interval. Call the office if you are unsure.' : ''}`,
      () => { state.doses = state.doses.filter(x => x.id !== dose.id); save(); render(); });
  }

  document.addEventListener('click', e => {
    const file = e.target.closest('a[download]');
    if (file) toast(`If your calendar doesn't open, find ${file.download} in your downloads and open it.`);
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const p = state.profile, act = b.dataset.act;
    if (act === 'day') { viewDate = P.addDays(viewDate, +b.dataset.n); render(); }
    else if (act === 'today') { viewDate = P.iso(new Date()); render(); }
    else if (act === 'sets') { state.count[b.dataset.key] = Math.max(0, (state.count[b.dataset.key] || 0) + +b.dataset.n); save(); render(); }
    else if (act === 'dose') logDose(b);
    else if (act === 'undose') { state.doses = state.doses.filter(x => x.id !== b.dataset.id); save(); render(); toast('Dose removed.'); }
    else if (act === 'add-appt') { const id = Date.now().toString(36); p.appts.push({ id, label: '', at: '' }); save(); render(); $('#al-' + id).focus(); }
    else if (act === 'del-appt') { p.appts = p.appts.filter(a => a.id !== b.dataset.id); save(); render(); }
    else if (act === 'finish') {
      if (!p.surgeryDate) { $('#err-surgery').hidden = false; $('#f-surgery').setAttribute('aria-invalid', 'true'); $('#f-surgery').focus(); return; }
      viewDate = P.iso(new Date());
      location.hash = '#today';
    } else if (act === 'reset') {
      if (!b.dataset.armed) { // two taps instead of a blocking confirm()
        b.dataset.armed = '1';
        b.textContent = 'Tap again to erase everything';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Erase all my data'; }, 5000);
        return;
      }
      try { localStorage.removeItem(KEY); } catch (err) { /* nothing stored */ }
      state = load();
      location.hash = '';
      render();
      toast('All data erased.');
    }
  });

  document.addEventListener('change', e => {
    const el = e.target, ds = el.dataset, p = state.profile;
    if (ds.act === 'hourly') { icsHourly = el.checked; render(); return; }
    if (ds.act === 'task') {
      if (el.checked) state.done[ds.key] = Date.now(); else delete state.done[ds.key];
      save(); render();
      return;
    }
    if (ds.kit) state.kit[ds.kit] = el.checked;
    else if (ds.field) {
      let val = el.value;
      const prev = p[ds.field];
      if (el.type === 'number' && val !== '') el.value = val = Math.min(+el.max, Math.max(+el.min, Math.round(+val)));
      if (ds.field.startsWith('times.')) {
        if (!val) { el.value = p.times[ds.field.slice(6)]; return; }
        p.times[ds.field.slice(6)] = val;
      } else p[ds.field] = val;
      if (ds.field === 'surgeryDate' && val) {
        $('#err-surgery').hidden = true;
        el.removeAttribute('aria-invalid');
        // Discharge follows the surgery date until it's set to something else. Chrome fires
        // change for each typed year digit (0002, 0020, ...), so copying only once would stick.
        if (!p.dischargeDate || p.dischargeDate === prev) p.dischargeDate = $('#f-discharge').value = val;
        $('#f-discharge').min = val;
      }
    } else if (ds.proc) {
      p.procedures = el.checked ? [...new Set([...p.procedures, ds.proc])] : p.procedures.filter(x => x !== ds.proc);
      const needed = id => p.procedures.some(pid => P.PROCEDURES.find(x => x.id === pid).care.includes(id));
      for (const id of P.PROCEDURES.find(x => x.id === ds.proc).care) {
        p.care[id] = el.checked || needed(id);
        const box = document.querySelector(`[data-care="${id}"]`);
        if (box) box.checked = p.care[id];
      }
    } else if (ds.care) p.care[ds.care] = el.checked;
    else if (ds.med) p.meds[ds.med] = el.checked;
    else if (ds.dex) { const [d, j] = ds.dex.split(',').map(Number); p.dex[d][j] = el.checked; }
    else if (ds.appt) { const a = p.appts.find(x => x.id === ds.appt); if (a) a[ds.k] = el.value; }
    else return;
    save();
  });

  document.addEventListener('submit', e => e.preventDefault());
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true }); });
  // Keep the as-needed countdowns current without disturbing someone mid-edit.
  setInterval(() => {
    if (document.visibilityState === 'visible' && $('#main').dataset.view === 'today' && !document.querySelector('#main details[open], #main input:focus')) render();
  }, 30000);
  render();
})();
