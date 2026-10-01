/*
 * Agent — aap ke dashboard ka assistant.
 * Saara data local hai; agent usi data ko parh kar jawab deta hai
 * (kitni videos bani, kitni rehti hain, kis client par kitna kaam baqi hai, waghera).
 */
const Agent = (() => {
  const S = Store;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function hrs(n) {
    return `${Math.round(n * 10) / 10}h`;
  }

  function videoLine(v) {
    const c = S.client(v.clientId);
    const due = v.dueDate ? `${S.fmtDate(v.dueDate)} (${S.relDay(v.dueDate)})` : 'no deadline';
    return `<li><b>${esc(v.title)}</b> — ${esc(c ? c.name : '?')} · ${esc(S.statusLabel(v.status))} · ${esc(due)}</li>`;
  }

  function list(videos, empty = 'Kuch nahi mila.', limit = 8) {
    if (!videos.length) return `<p>${empty}</p>`;
    const more = videos.length > limit ? `<p class="muted">…aur ${videos.length - limit} more</p>` : '';
    return `<ul>${videos.slice(0, limit).map(videoLine).join('')}</ul>${more}`;
  }

  // ---------- Proactive insights (dashboard "Agent Brief") ----------
  function insights() {
    const st = S.get();
    const out = [];
    const pending = st.videos.filter(v => !S.isDone(v));

    const overdue = pending.filter(S.isOverdue);
    if (overdue.length) {
      out.push({ level: 'danger', icon: '⛔', text: `${overdue.length} video${overdue.length > 1 ? 's' : ''} deadline se late ${overdue.length > 1 ? 'hain' : 'hai'}: ${overdue.slice(0, 3).map(v => `“${v.title}”`).join(', ')}` });
    }

    const soon = pending.filter(v => v.dueDate && S.daysUntil(v.dueDate) >= 0 && S.daysUntil(v.dueDate) <= 2);
    if (soon.length) {
      out.push({ level: 'warn', icon: '⏰', text: `${soon.length} video${soon.length > 1 ? 's' : ''} agle 48 ghante me due: ${soon.slice(0, 3).map(v => `“${v.title}”`).join(', ')}` });
    }

    const stuckReview = pending.filter(v => v.status === 'review' && v.statusChangedAt && (Date.now() - v.statusChangedAt) > 3 * 86400000);
    stuckReview.forEach(v => {
      const c = S.client(v.clientId);
      out.push({ level: 'info', icon: '💬', text: `“${v.title}” 3+ din se client review me hai — ${c ? c.name : 'client'} se follow-up karein.` });
    });

    const noFootage = pending.filter(v => v.status === 'planned' && v.dueDate && S.daysUntil(v.dueDate) <= 4 && S.daysUntil(v.dueDate) >= 0);
    if (noFootage.length) {
      out.push({ level: 'warn', icon: '🎞️', text: `${noFootage.length} planned video${noFootage.length > 1 ? 's' : ''} ki footage abhi tak nahi aayi aur deadline qareeb hai — footage mangwa lein.` });
    }

    const incomplete = st.videos.filter(v => S.isDone(v) && (v.deliverables || []).some(d => !d.done));
    if (incomplete.length) {
      out.push({ level: 'info', icon: '📦', text: `${incomplete.length} delivered video${incomplete.length > 1 ? 's' : ''} me kuch deliverables tick nahi hue — check kar lein.` });
    }

    st.clients.forEach(c => {
      const cs = S.clientStats(c);
      if (!cs.target) return;
      const plannedThisMonth = cs.deliveredMonth + cs.pending;
      if (plannedThisMonth < cs.target) {
        out.push({ level: 'info', icon: '🗓️', text: `${c.name}: is mahine ka target ${cs.target} hai, abhi sirf ${plannedThisMonth} plan/deliver hui hain — ${cs.target - plannedThisMonth} aur content ideas chahiye.` });
      }
    });

    const s = S.stats();
    if (s.unpaid > 0) {
      out.push({ level: 'info', icon: '💰', text: `${S.money(s.unpaid)} ki payment delivered videos par pending hai.` });
    }

    const week = pending.filter(v => v.dueDate && S.daysUntil(v.dueDate) <= 7);
    const weekHours = week.reduce((a, v) => a + S.hoursLeft(v), 0);
    if (weekHours > 40) {
      out.push({ level: 'warn', icon: '🔥', text: `Is hafte ~${hrs(weekHours)} ka kaam hai — heavy week. Kuch deadlines aage karwane ka sochein.` });
    }

    if (!out.length) {
      out.push({ level: 'ok', icon: '✅', text: st.videos.length ? 'Sab on track hai! Koi urgent cheez nahi.' : 'Shuru karne ke liye client add karein ya planner import karein.' });
    }
    return out;
  }

  function nextStep(v) {
    const pr = S.deliverableProgress(v);
    const base = (S.STATUSES.find(s => s.id === v.status) || {}).next || '';
    if ((v.status === 'editing' || v.status === 'revision') && pr.total) {
      return `${base} (${pr.done}/${pr.total} deliverables)`;
    }
    return base;
  }

  function todayPlan(limit = 5) {
    return S.workQueue().slice(0, limit).map(v => ({ video: v, step: nextStep(v) }));
  }

  // ---------- Chat ----------
  function helpText() {
    return `
    <p>Main aap ke data se jawab deta hoon. Aap ye pooch sakte hain:</p>
    <ul>
      <li><b>summary</b> — overall report</li>
      <li><b>kitni videos bani</b> / <b>kitni rehti hain</b></li>
      <li><b>aaj kya karun</b> — aaj ka plan</li>
      <li><b>late / overdue</b> videos</li>
      <li><b>is hafte</b> kya due hai</li>
      <li><b>workload</b> — kis client par kitna kaam</li>
      <li><b>deliverables</b> jo abhi baqi hain</li>
      <li><b>payment</b> status</li>
      <li>kisi client ka naam likhein, e.g. <b>${esc((S.get().clients[0] || { name: 'Client' }).name)} ka status</b></li>
    </ul>`;
  }

  function summary() {
    const s = S.stats();
    const st = S.get();
    return `
      <p><b>Overall report</b> (${st.clients.length} clients)</p>
      <ul>
        <li>Total videos: <b>${s.total}</b></li>
        <li>✅ Ban chuki (delivered): <b>${s.delivered}</b></li>
        <li>⏳ Rehti hain (pending): <b>${s.pending}</b></li>
        <li>⛔ Late: <b>${s.overdue}</b> · ⏰ 48h me due: <b>${s.dueSoon}</b></li>
        <li>🕒 Estimated kaam baqi: <b>${hrs(s.hoursLeft)}</b></li>
        <li>📅 Is mahine delivered: <b>${s.deliveredMonth}</b> · earning ${esc(S.money(s.earnedMonth))}</li>
      </ul>`;
  }

  function workload() {
    const st = S.get();
    if (!st.clients.length) return '<p>Abhi koi client nahi hai.</p>';
    const rows = st.clients
      .map(c => ({ c, s: S.clientStats(c) }))
      .sort((a, b) => b.s.hoursLeft - a.s.hoursLeft)
      .map(({ c, s }) => `<li><b>${esc(c.name)}</b>: ${s.delivered}/${s.total} bani, ${s.pending} rehti · ~${hrs(s.hoursLeft)} kaam${s.overdue ? ` · <span class="t-danger">${s.overdue} late</span>` : ''}</li>`)
      .join('');
    return `<p><b>Client-wise workload</b> (zyada kaam upar):</p><ul>${rows}</ul>`;
  }

  function clientReport(c) {
    const s = S.clientStats(c);
    const vids = S.clientVideos(c.id);
    const pending = vids.filter(v => !S.isDone(v)).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    const targetLine = s.target ? `<li>Monthly target: ${s.deliveredMonth}/${s.target} delivered is mahine</li>` : '';
    const notes = c.notes ? `<p class="muted">Style notes: ${esc(c.notes)}</p>` : '';
    return `
      <p><b>${esc(c.name)}</b> ${c.platform ? `· ${esc(c.platform)}` : ''}</p>
      <ul>
        <li>Total: ${s.total} · ✅ ${s.delivered} bani · ⏳ ${s.pending} rehti</li>
        <li>Kaam baqi: ~${hrs(s.hoursLeft)}${s.overdue ? ` · <span class="t-danger">${s.overdue} late</span>` : ''}</li>
        ${targetLine}
        <li>Payment pending: ${esc(S.money(s.unpaid))}</li>
      </ul>
      ${notes}
      <p><b>Pending videos:</b></p>${list(pending, 'Is client ki koi video pending nahi. 🎉')}`;
  }

  function pendingDeliverables() {
    const items = S.get().videos
      .filter(v => (v.status === 'editing' || v.status === 'revision' || v.status === 'review' || S.isDone(v)))
      .map(v => ({ v, left: (v.deliverables || []).filter(d => !d.done) }))
      .filter(x => x.left.length);
    if (!items.length) return '<p>Saare active videos ke deliverables complete hain. 👌</p>';
    return `<p><b>Baqi deliverables:</b></p><ul>${items.slice(0, 8).map(({ v, left }) =>
      `<li><b>${esc(v.title)}</b>: ${left.map(d => esc(d.label)).join(', ')}</li>`).join('')}</ul>`;
  }

  function payments() {
    const st = S.get();
    const unpaid = st.videos.filter(v => S.isDone(v) && !v.paid && Number(v.amount));
    const s = S.stats();
    if (!unpaid.length) return `<p>Koi payment pending nahi. Is mahine ki earning: <b>${esc(S.money(s.earnedMonth))}</b></p>`;
    const byClient = {};
    unpaid.forEach(v => { byClient[v.clientId] = (byClient[v.clientId] || 0) + Number(v.amount); });
    return `<p>Pending payment: <b>${esc(S.money(s.unpaid))}</b></p><ul>${Object.entries(byClient).map(([id, amt]) =>
      `<li>${esc((S.client(id) || {}).name || '?')}: ${esc(S.money(amt))}</li>`).join('')}</ul>
      <p class="muted">Is mahine ki earning: ${esc(S.money(s.earnedMonth))}</p>`;
  }

  function plan() {
    const p = todayPlan(6);
    if (!p.length) return '<p>Koi pending kaam nahi — naye content ideas plan karne ka acha waqt hai! 🎬</p>';
    return `<p><b>Aaj ka plan</b> (is order me kaam karein):</p><ol>${p.map(({ video: v, step }) => {
      const c = S.client(v.clientId);
      return `<li><b>${esc(v.title)}</b> — ${esc(c ? c.name : '')}<br><span class="muted">${esc(step)} · ${esc(v.dueDate ? S.relDay(v.dueDate) : 'no deadline')} · ~${hrs(S.hoursLeft(v))}</span></li>`;
    }).join('')}</ol>`;
  }

  function ask(raw) {
    const q = raw.toLowerCase().trim();
    const st = S.get();
    if (!q) return helpText();

    const c = st.clients.find(cl => q.includes(cl.name.toLowerCase())) ||
      st.clients.find(cl => cl.name.toLowerCase().split(/\s+/).some(w => w.length > 3 && q.includes(w)));
    if (c) return clientReport(c);

    const pending = st.videos.filter(v => !S.isDone(v));

    if (/help|madad|kya pooch|commands?/.test(q)) return helpText();
    if (/overdue|\blate\b|\bder\b|miss/.test(q)) {
      return `<p><b>Late videos:</b></p>${list(pending.filter(S.isOverdue), 'Koi video late nahi! 💪')}`;
    }
    if (/aaj|today|kya karu|kya karun|plan|priority|next/.test(q)) return plan();
    if (/hafta|hafte|week/.test(q)) {
      const wk = pending.filter(v => v.dueDate && S.daysUntil(v.dueDate) <= 7).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const h = wk.reduce((a, v) => a + S.hoursLeft(v), 0);
      return `<p><b>Agle 7 din</b>: ${wk.length} videos · ~${hrs(h)} kaam</p>${list(wk, 'Is hafte koi deadline nahi.')}`;
    }
    if (/deliverable|export|format|checklist/.test(q)) return pendingDeliverables();
    if (/pay|paisa|paise|earning|invoice|amount|raqam/.test(q)) return payments();
    if (/workload|kaam|kam|load|client/.test(q) && !/bani|rehti|baqi/.test(q)) return workload();
    if (/bani|ban gai|ban chuki|done|deliver|complete|mukammal/.test(q)) {
      const done = st.videos.filter(S.isDone).sort((a, b) => (b.deliveredAt || 0) - (a.deliveredAt || 0));
      return `<p>✅ <b>${done.length}</b> videos ban chuki hain (is mahine ${S.stats().deliveredMonth}).</p>${list(done, 'Abhi tak koi video deliver nahi hui.', 6)}`;
    }
    if (/rehti|reh gai|baqi|pending|remaining|left/.test(q)) {
      const h = pending.reduce((a, v) => a + S.hoursLeft(v), 0);
      return `<p>⏳ <b>${pending.length}</b> videos rehti hain · ~${hrs(h)} kaam baqi.</p>${list(S.workQueue())}`;
    }
    if (/summary|report|kitni|total|status|overall|hisab/.test(q)) return summary();
    if (/salam|hello|hi\b|hey/.test(q)) {
      const name = st.settings.editorName ? ` ${esc(st.settings.editorName)}` : '';
      return `<p>Wa Alaikum Assalam${name}! 👋</p>${summary()}`;
    }
    return `<p>Ye sawal samajh nahi aaya. 🤔</p>${helpText()}`;
  }

  return { insights, todayPlan, ask, nextStep, help: helpText };
})();
