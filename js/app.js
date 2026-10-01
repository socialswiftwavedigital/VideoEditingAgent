/*
 * App — UI rendering, lock screen, navigation, modals.
 */
(() => {
  const S = Store;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hrs = n => `${Math.round(n * 10) / 10}h`;

  const ui = {
    view: 'dashboard',
    videoMode: 'board',
    filter: { client: '', status: '', q: '' },
    chat: [],
    plannerRows: null
  };

  const TITLES = { dashboard: 'Dashboard', videos: 'Videos', clients: 'Clients', planner: 'Content Planner', agent: 'Agent', settings: 'Settings' };

  // ================= Theme =================
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  try { applyTheme(localStorage.getItem('vea_theme')); } catch { /* ignore */ }
  if (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: light)').matches) applyTheme('light');

  // ================= Toast =================
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ================= Lock screen =================
  let lockMode = 'unlock';
  let guardTimer;

  function showLock() {
    $('#app').hidden = true;
    $('#lock').hidden = false;
    closeModal();
    lockMode = Vault.exists() ? 'unlock' : 'setup';
    const setup = lockMode === 'setup';
    $('#lock-sub').textContent = setup
      ? 'Pehli dafa: apna security code banayein (kam se kam 4 characters)'
      : 'Apna security code darj karein';
    $('#lock-code2').hidden = !setup;
    $('#lock-btn').textContent = setup ? 'Code set karein & shuru karein' : 'Unlock';
    $('#lock-reset').hidden = setup;
    $('#lock-code').value = '';
    $('#lock-code2').value = '';
    $('#lock-msg').textContent = '';
    if (!Vault.isSupported()) {
      $('#lock-msg').textContent = 'Ye browser encryption support nahi karta. Chrome/Edge/Firefox me https ya localhost se kholein.';
    }
    updateGuard();
    setTimeout(() => $('#lock-code').focus(), 50);
  }

  function updateGuard() {
    clearInterval(guardTimer);
    const tick = () => {
      const ms = Vault.lockedForMs();
      const btn = $('#lock-btn');
      if (ms > 0) {
        btn.disabled = true;
        $('#lock-msg').textContent = `Bohat ghalat koshishen. ${Math.ceil(ms / 1000)}s baad try karein.`;
      } else {
        btn.disabled = false;
        clearInterval(guardTimer);
        if (/baad try/.test($('#lock-msg').textContent)) $('#lock-msg').textContent = '';
      }
    };
    tick();
    guardTimer = setInterval(tick, 1000);
  }

  function shake(msg) {
    $('#lock-msg').textContent = msg;
    const card = $('.lock-card');
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }

  $('#lock-form').addEventListener('submit', async e => {
    e.preventDefault();
    const code = $('#lock-code').value;
    const btn = $('#lock-btn');
    if (Vault.lockedForMs() > 0) return;
    if (lockMode === 'setup') {
      if (code.length < 4) return shake('Code kam se kam 4 characters ka ho.');
      if (code !== $('#lock-code2').value) return shake('Dono codes match nahi kar rahe.');
      btn.disabled = true;
      btn.textContent = 'Encrypting…';
      try {
        await Vault.create(code, S.empty());
        S.load(S.empty());
        enterApp(true);
      } catch (err) {
        console.error(err);
        shake('Setup fail hua: ' + err.message);
      }
      btn.disabled = false;
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const data = await Vault.unlock(code);
      Vault.recordSuccess();
      S.load(data);
      enterApp(false);
    } catch {
      const g = Vault.recordFail();
      shake(g.fails >= 5 ? '' : `Ghalat code. (${5 - g.fails} koshishen baqi)`);
      updateGuard();
    }
    btn.disabled = Vault.lockedForMs() > 0;
    btn.textContent = 'Unlock';
    $('#lock-code').value = '';
  });

  $('#lock-reset').addEventListener('click', () => {
    const ok = prompt('Ye saara data hamesha ke liye delete kar dega. Confirm karne ke liye DELETE likhein:');
    if (ok === 'DELETE') {
      Vault.wipe();
      showLock();
      toast('Sab reset ho gaya. Naya code banayein.');
    }
  });

  function lockApp() {
    Vault.lock();
    S.load(S.empty());
    ui.chat = [];
    showLock();
  }

  // Auto-lock after inactivity
  let idleTimer;
  function resetIdle() {
    clearTimeout(idleTimer);
    const mins = Number(S.get().settings.autoLock) || 0;
    if (!Vault.isUnlocked() || mins <= 0) return;
    idleTimer = setTimeout(() => { lockApp(); toast('Inactivity ki wajah se lock ho gaya 🔒'); }, mins * 60000);
  }
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(ev => document.addEventListener(ev, resetIdle, { passive: true }));

  function enterApp(firstTime) {
    $('#lock').hidden = true;
    $('#app').hidden = false;
    ui.chat = [{ me: false, html: greeting() }];
    navigate(firstTime ? 'settings' : 'dashboard');
    resetIdle();
    if (firstTime) toast('Code set ho gaya! Apna naam likhein ya sample data load karein.');
  }

  S.setOnSaved(ok => {
    const el = $('#save-state');
    el.textContent = ok ? `🔒 Saved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '⚠️ Save fail';
  });

  // ================= Navigation =================
  function navigate(view) {
    ui.view = view;
    $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $('#view-title').textContent = TITLES[view];
    $('.sidebar').classList.remove('open');
    render();
    window.scrollTo(0, 0);
  }

  $('#nav').addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (b) navigate(b.dataset.view);
  });
  $('#menu-btn').addEventListener('click', () => $('.sidebar').classList.toggle('open'));

  function render() {
    const main = $('#main');
    const views = { dashboard: viewDashboard, videos: viewVideos, clients: viewClients, planner: viewPlanner, agent: viewAgent, settings: viewSettings };
    main.innerHTML = views[ui.view]();
    if (ui.view === 'videos' && ui.videoMode === 'board') bindBoard();
    if (ui.view === 'agent') {
      const log = $('.chat-log');
      log.scrollTop = log.scrollHeight;
    }
  }

  // ================= Shared bits =================
  function statusChip(status) {
    return `<span class="chip status-chip s-${status}">${esc(S.statusLabel(status))}</span>`;
  }

  function dueChip(v) {
    if (!v.dueDate) return '<span class="chip">No date</span>';
    if (S.isDone(v)) return `<span class="chip ok">${esc(S.fmtDate(v.dueDate))}</span>`;
    const d = S.daysUntil(v.dueDate);
    const cls = d < 0 ? 'danger' : d <= 2 ? 'warn' : '';
    return `<span class="chip ${cls}">📅 ${esc(S.fmtDate(v.dueDate))} · ${esc(S.relDay(v.dueDate))}</span>`;
  }

  function clientName(id) {
    const c = S.client(id);
    return c ? c.name : 'Unknown';
  }

  function clientColor(id) {
    const c = S.client(id);
    return c ? c.color : 'var(--muted)';
  }

  function emptyState(icon, text, action = '') {
    return `<div class="empty"><div class="big">${icon}</div><p>${text}</p>${action}</div>`;
  }

  function greeting() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Subah bakhair' : h < 17 ? 'Assalam o Alaikum' : 'Shaam bakhair';
    const name = S.get().settings.editorName;
    return `<p>${part}${name ? ' ' + esc(name) : ''}! 👋 Main aap ka editing agent hoon.</p>${Agent.ask('summary')}<p class="muted">“help” likhein to dekhein main kya kya bata sakta hoon.</p>`;
  }

  // ================= Dashboard =================
  function viewDashboard() {
    const st = S.get();
    const s = S.stats();
    const name = st.settings.editorName;
    const dateLine = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    if (!st.clients.length && !st.videos.length) {
      return `
        <div class="hero"><div><h2>Khush aamdeed${name ? ', ' + esc(name) : ''} 👋</h2><p class="muted">${dateLine}</p></div></div>
        <div class="card">${emptyState('🎬', 'Abhi koi data nahi. Client add karein, planner import karein, ya sample data se try karein.',
          `<div class="row" style="justify-content:center"><button class="btn primary" data-action="new-client">＋ Client</button><button class="btn" data-goto="planner">🗓️ Planner import</button><button class="btn" data-action="sample">✨ Sample data</button></div>`)}</div>`;
    }

    const pct = s.total ? Math.round((s.delivered / s.total) * 100) : 0;
    const kpis = [
      { label: 'Active clients', value: st.clients.length, sub: `${S.stats().deliveredMonth} videos is mahine`, c: 'var(--accent)' },
      { label: 'Total videos', value: s.total, sub: `${pct}% complete`, c: 'var(--info)' },
      { label: '✅ Ban chuki', value: s.delivered, sub: 'Delivered', c: 'var(--ok)' },
      { label: '⏳ Rehti hain', value: s.pending, sub: `${s.dueSoon} agle 48h me due`, c: 'var(--warn)' },
      { label: '⛔ Late', value: s.overdue, sub: s.overdue ? 'Foran dekhein' : 'Sab time par', c: 'var(--danger)' },
      { label: '🕒 Kaam baqi', value: hrs(s.hoursLeft), sub: 'Estimated editing time', c: 'var(--accent-2)' },
      { label: '💰 Payment due', value: S.money(s.unpaid), sub: `Is mahine: ${S.money(s.earnedMonth)}`, c: '#e5579a' }
    ];

    const insights = Agent.insights().map(i => `<div class="insight ${i.level}"><span>${i.icon}</span><span>${esc(i.text)}</span></div>`).join('');
    const plan = Agent.todayPlan(5);
    const planHtml = plan.length ? plan.map(({ video: v, step }, i) => `
      <div class="plan-item" data-open-video="${v.id}">
        <div class="plan-num">${i + 1}</div>
        <div style="flex:1;min-width:0">
          <div><b>${esc(v.title)}</b> <span class="muted">· ${esc(clientName(v.clientId))}</span></div>
          <div class="tiny muted">${esc(step)} · ~${hrs(S.hoursLeft(v))}</div>
        </div>
        ${dueChip(v)}
      </div>`).join('') : emptyState('🎉', 'Koi pending kaam nahi!');

    const clientRows = st.clients.map(c => {
      const cs = S.clientStats(c);
      const done = cs.total ? (cs.delivered / cs.total) * 100 : 0;
      const target = cs.target ? `${cs.deliveredMonth}/${cs.target}` : '—';
      return `<tr class="clickable" data-client-videos="${c.id}">
        <td><span class="dot" style="background:${c.color}"></span><b>${esc(c.name)}</b><div class="tiny muted">${esc(c.platform || '')}</div></td>
        <td style="min-width:140px"><div class="bar"><span style="width:${done}%;background:var(--ok)"></span></div><div class="tiny muted">${cs.delivered}/${cs.total} bani</div></td>
        <td><b>${cs.pending}</b>${cs.overdue ? ` <span class="chip danger">${cs.overdue} late</span>` : ''}</td>
        <td>${hrs(cs.hoursLeft)}</td>
        <td>${target}</td>
        <td>${cs.next ? `${esc(S.fmtDate(cs.next.dueDate))} <span class="tiny muted">${esc(S.relDay(cs.next.dueDate))}</span>` : '—'}</td>
      </tr>`;
    }).join('');

    const statusColors = { planned: '#8d93b0', footage: '#3ea8ff', editing: '#7c5cff', review: '#f5b82e', revision: '#ff7a59', delivered: '#3ddc97' };
    const pipe = S.STATUSES.map(x => s.byStatus[x.id] ? `<span style="width:${(s.byStatus[x.id] / s.total) * 100}%;background:${statusColors[x.id]}" title="${x.label}: ${s.byStatus[x.id]}"></span>` : '').join('');
    const legend = S.STATUSES.map(x => `<span><i style="background:${statusColors[x.id]}"></i>${x.label} <b>${s.byStatus[x.id]}</b></span>`).join('');

    const upcoming = S.workQueue().filter(v => v.dueDate && S.daysUntil(v.dueDate) <= 7).slice(0, 8);
    const upHtml = upcoming.length ? upcoming.map(v => `
      <div class="plan-item" data-open-video="${v.id}">
        <span class="dot" style="background:${clientColor(v.clientId)};margin-top:6px"></span>
        <div style="flex:1;min-width:0"><b>${esc(v.title)}</b><div class="tiny muted">${esc(clientName(v.clientId))} · ${esc(S.TYPES[v.type]?.label || v.type)}</div></div>
        ${statusChip(v.status)}
      </div>`).join('') : emptyState('🌤️', 'Agle 7 din me koi deadline nahi.');

    const activity = st.activity.slice(0, 6).map(a => `<div class="tiny" style="padding:5px 0;border-bottom:1px dashed var(--line)">${esc(a.text)} <span class="muted">· ${new Date(a.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('') || '<p class="muted tiny">Abhi koi activity nahi.</p>';

    return `
      <div class="hero">
        <div><h2>${name ? `Assalam o Alaikum, ${esc(name)} 👋` : 'Assalam o Alaikum 👋'}</h2><p class="muted">${dateLine}</p></div>
        <div class="row"><button class="btn" data-goto="agent">🤖 Agent se poochein</button><button class="btn" data-action="new-client">＋ Client</button></div>
      </div>
      <div class="kpis">${kpis.map(k => `<div class="kpi" style="--kpi:${k.c}"><div class="label">${k.label}</div><div class="value">${esc(k.value)}</div><div class="sub">${esc(k.sub)}</div></div>`).join('')}</div>

      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><h2>🤖 Agent Brief</h2><span class="tiny muted">Auto alerts</span></div><div class="insights">${insights}</div></div>
        <div class="card"><div class="card-head"><h2>🎯 Aaj ka plan</h2><span class="tiny muted">Deadline + priority ke hisaab se</span></div>${planHtml}</div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><h2>👥 Client-wise progress</h2><span class="tiny muted">Row par click → us client ki videos</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Client</th><th>Progress</th><th>Rehti</th><th>Kaam baqi</th><th>Month target</th><th>Next deadline</th></tr></thead>
          <tbody>${clientRows || '<tr><td colspan="6" class="muted">Koi client nahi</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="grid grid-3">
        <div class="card"><div class="card-head"><h2>🎬 Pipeline</h2></div>${s.total ? `<div class="pipeline">${pipe}</div><div class="legend">${legend}</div>` : '<p class="muted">Koi video nahi</p>'}</div>
        <div class="card"><div class="card-head"><h2>📅 Agle 7 din</h2></div>${upHtml}</div>
        <div class="card"><div class="card-head"><h2>🕘 Recent activity</h2></div>${activity}</div>
      </div>`;
  }

  // ================= Videos =================
  function filteredVideos() {
    const f = ui.filter;
    const q = f.q.toLowerCase();
    return S.get().videos.filter(v =>
      (!f.client || v.clientId === f.client) &&
      (!f.status || v.status === f.status) &&
      (!q || v.title.toLowerCase().includes(q) || clientName(v.clientId).toLowerCase().includes(q))
    );
  }

  function videoToolbar() {
    const st = S.get();
    return `<div class="toolbar">
      <input type="search" id="f-q" placeholder="🔍 Search title / client" value="${esc(ui.filter.q)}">
      <select id="f-client"><option value="">Saare clients</option>${st.clients.map(c => `<option value="${c.id}" ${ui.filter.client === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      ${ui.videoMode === 'list' ? `<select id="f-status"><option value="">Saare status</option>${S.STATUSES.map(s => `<option value="${s.id}" ${ui.filter.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}</select>` : ''}
      <span class="spacer"></span>
      <div class="seg"><button data-mode="board" class="${ui.videoMode === 'board' ? 'active' : ''}">Board</button><button data-mode="list" class="${ui.videoMode === 'list' ? 'active' : ''}">List</button></div>
    </div>`;
  }

  function vcard(v) {
    const pr = S.deliverableProgress(v);
    return `<div class="vcard" draggable="true" data-id="${v.id}" data-open-video="${v.id}" style="--cc:${clientColor(v.clientId)}">
      <div class="title">${esc(v.title)}</div>
      <div class="meta"><span>${esc(clientName(v.clientId))}</span>·<span>${esc((S.TYPES[v.type] || {}).label || v.type)}</span></div>
      <div class="meta">${dueChip(v)}${v.priority === 'high' ? '<span class="chip high">🔥 High</span>' : ''}</div>
      ${pr.total ? `<div class="bar"><span style="width:${(pr.done / pr.total) * 100}%;background:var(--accent-2)"></span></div><div class="meta">📦 ${pr.done}/${pr.total} deliverables${v.revisions ? ` · 🔁 ${v.revisions} rev` : ''}</div>` : ''}
    </div>`;
  }

  function viewVideos() {
    const vids = filteredVideos();
    if (!S.get().clients.length) {
      return `<div class="card">${emptyState('👥', 'Pehle ek client add karein, phir videos.', '<button class="btn primary" data-action="new-client">＋ Client</button>')}</div>`;
    }
    if (ui.videoMode === 'board') {
      const cols = S.STATUSES.map(s => {
        const items = vids.filter(v => v.status === s.id).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
        return `<div class="col s-${s.id}" data-status="${s.id}">
          <div class="col-head"><span>${s.label}</span><span class="chip">${items.length}</span></div>
          ${items.map(vcard).join('')}
        </div>`;
      }).join('');
      return `${videoToolbar()}<p class="tiny muted" style="margin-top:-6px">Cards ko drag karke status badlein, ya card khol kar.</p><div class="board">${cols}</div>`;
    }
    const rows = vids.sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9')).map(v => {
      const pr = S.deliverableProgress(v);
      return `<tr class="clickable" data-open-video="${v.id}">
        <td><span class="dot" style="background:${clientColor(v.clientId)}"></span><b>${esc(v.title)}</b><div class="tiny muted">${esc(clientName(v.clientId))}</div></td>
        <td class="tiny">${esc((S.TYPES[v.type] || {}).label || v.type)}</td>
        <td>${statusChip(v.status)}</td>
        <td>${dueChip(v)}</td>
        <td class="tiny">${pr.done}/${pr.total}</td>
        <td class="tiny">${hrs(S.hoursLeft(v))}</td>
        <td class="tiny">${esc(S.money(v.amount))} ${S.isDone(v) ? (v.paid ? '<span class="chip ok">Paid</span>' : '<span class="chip warn">Unpaid</span>') : ''}</td>
      </tr>`;
    }).join('');
    return `${videoToolbar()}<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Video</th><th>Type</th><th>Status</th><th>Deadline</th><th>Deliverables</th><th>Kaam baqi</th><th>Amount</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">Koi video nahi mili</td></tr>'}</tbody></table></div></div>`;
  }

  function bindBoard() {
    let dragId = null;
    $$('.vcard').forEach(card => {
      card.addEventListener('dragstart', e => {
        dragId = card.dataset.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    $$('.col').forEach(col => {
      col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', e => {
        e.preventDefault();
        col.classList.remove('drag-over');
        if (dragId) {
          S.setStatus(dragId, col.dataset.status);
          if (col.dataset.status === 'delivered') toast('Delivered! 🎉 Payment track karna na bhoolein.');
          render();
        }
      });
    });
  }

  // ================= Clients =================
  function viewClients() {
    const st = S.get();
    if (!st.clients.length) {
      return `<div class="card">${emptyState('👥', 'Abhi koi client nahi.', '<button class="btn primary" data-action="new-client">＋ Pehla client add karein</button>')}</div>`;
    }
    const cards = st.clients.map(c => {
      const cs = S.clientStats(c);
      const done = cs.total ? (cs.delivered / cs.total) * 100 : 0;
      const monthPct = cs.target ? Math.min(100, (cs.deliveredMonth / cs.target) * 100) : 0;
      return `<div class="card client-card" style="--cc:${c.color}">
        <div class="row">
          <div class="avatar">${esc(c.name.slice(0, 1).toUpperCase())}</div>
          <div style="flex:1;min-width:0"><h3>${esc(c.name)}</h3><div class="tiny muted">${esc([c.platform, c.contact].filter(Boolean).join(' · ') || '—')}</div></div>
          <button class="btn small" data-edit-client="${c.id}">Edit</button>
        </div>
        <div class="nums">
          <div><b>${cs.delivered}</b><span>Bani</span></div>
          <div><b>${cs.pending}</b><span>Rehti</span></div>
          <div><b>${hrs(cs.hoursLeft)}</b><span>Kaam baqi</span></div>
        </div>
        <div><div class="row tiny muted"><span>Overall</span><span class="spacer"></span><span>${Math.round(done)}%</span></div><div class="bar"><span style="width:${done}%;background:var(--ok)"></span></div></div>
        ${cs.target ? `<div><div class="row tiny muted"><span>Is mahine target</span><span class="spacer"></span><span>${cs.deliveredMonth}/${cs.target}</span></div><div class="bar"><span style="width:${monthPct}%;background:${c.color}"></span></div></div>` : ''}
        <div class="row tiny">
          ${cs.overdue ? `<span class="chip danger">⛔ ${cs.overdue} late</span>` : ''}
          ${cs.unpaid ? `<span class="chip warn">💰 ${esc(S.money(cs.unpaid))} due</span>` : ''}
          ${c.rate ? `<span class="chip">${esc(S.money(c.rate))}/video</span>` : ''}
        </div>
        ${c.notes ? `<p class="tiny muted" style="margin:0">🎨 ${esc(c.notes)}</p>` : ''}
        <div class="row"><button class="btn small" data-client-videos="${c.id}">🎞️ Videos dekhein</button><button class="btn small" data-new-video-for="${c.id}">＋ Video</button></div>
      </div>`;
    }).join('');
    return `<div class="toolbar"><span class="muted">${st.clients.length} clients</span><span class="spacer"></span><button class="btn primary" data-action="new-client">＋ Client</button></div><div class="grid grid-3">${cards}</div>`;
  }

  // ================= Planner =================
  function viewPlanner() {
    const st = S.get();
    const preview = ui.plannerRows;
    const previewHtml = preview ? `
      <div class="card">
        <div class="card-head"><h2>Preview (${preview.filter(r => !r.error).length} valid / ${preview.length})</h2>
          <div class="row"><button class="btn" data-action="planner-cancel">Cancel</button><button class="btn primary" data-action="planner-import" ${preview.some(r => !r.error) ? '' : 'disabled'}>✅ Import karein</button></div></div>
        <div class="table-wrap"><table><thead><tr><th>#</th><th>Date</th><th>Client</th><th>Title</th><th>Type</th><th>Notes</th><th></th></tr></thead><tbody>
        ${preview.map(r => `<tr><td class="tiny muted">${r.line}</td><td>${r.date ? esc(S.fmtDate(r.date)) : '—'}</td>
          <td>${esc(r.clientName)}${r.clientName && !S.findClientByName(r.clientName) ? ' <span class="chip ok">new</span>' : ''}</td>
          <td>${esc(r.title)}</td><td class="tiny">${esc(S.TYPES[r.type].label)}</td><td class="tiny muted">${esc(r.notes)}</td>
          <td>${r.error ? `<span class="chip danger">${esc(r.error)}</span>` : '<span class="chip ok">OK</span>'}</td></tr>`).join('')}
        </tbody></table></div>
      </div>` : '';

    // 14-day content calendar
    const days = [];
    for (let i = -1; i < 14; i++) {
      const ds = S.addDays(i);
      const items = st.videos.filter(v => v.dueDate === ds);
      if (items.length || i < 1) days.push({ ds, items, i });
    }
    const undated = st.videos.filter(v => !v.dueDate && !S.isDone(v));
    const cal = days.map(({ ds, items, i }) => {
      const [y, m, d] = ds.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return `<div class="cal-day">
        <div class="cal-date"><b>${dt.getDate()}</b><span class="tiny muted">${dt.toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })}${i === 0 ? ' · Aaj' : ''}</span></div>
        <div class="cal-items">${items.length ? items.map(v => `<div class="cal-item" style="--cc:${clientColor(v.clientId)}" data-open-video="${v.id}"><b>${esc(v.title)}</b> <span class="muted tiny">· ${esc(clientName(v.clientId))}</span> ${statusChip(v.status)}${v.content && v.content.hook ? `<div class="tiny muted">🪝 ${esc(v.content.hook)}</div>` : ''}</div>`).join('') : '<span class="tiny muted">—</span>'}</div>
      </div>`;
    }).join('');

    return `
      <div class="grid grid-2">
        <div class="stack">
          <div class="card">
            <div class="card-head"><h2>📥 Planner import</h2></div>
            <p class="muted" style="margin-top:0">Client ka content planner yahan paste karein (Excel/Google Sheet se copy bhi chalega). Har line = ek video. Agent title se type (Reel / YouTube / Ad…) khud pehchan leta hai aur us type ke deliverables laga deta hai.</p>
            <pre class="format">date | client | title | type | notes
2026-10-05 | Glow Skincare | Serum review | reel | Hook: "3 din me glow"
12/10 | TechWithAli | Laptop guide | youtube | B-roll from last shoot
Cafe Bites | Weekend deal | ad</pre>
            <div class="form-grid">
              <div class="full"><label for="planner-text">Planner text</label><textarea id="planner-text" rows="8" placeholder="Yahan paste karein…"></textarea></div>
              <div><label for="planner-client">Default client (agar line me client na ho)</label>
                <select id="planner-client"><option value="">—</option>${st.clients.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
              <div style="display:flex;align-items:flex-end"><button class="btn primary block" data-action="planner-preview">👀 Preview</button></div>
            </div>
          </div>
          ${previewHtml}
        </div>
        <div class="card">
          <div class="card-head"><h2>🗓️ Content calendar</h2><span class="tiny muted">Agle 2 hafte</span></div>
          <div class="cal">${cal}</div>
          ${undated.length ? `<div class="section-title">Bina date ke (${undated.length})</div><div class="cal-items">${undated.map(v => `<div class="cal-item" style="--cc:${clientColor(v.clientId)}" data-open-video="${v.id}"><b>${esc(v.title)}</b> <span class="muted tiny">· ${esc(clientName(v.clientId))}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  // ================= Agent =================
  function viewAgent() {
    const chips = ['Summary', 'Aaj kya karun?', 'Kitni videos bani?', 'Kitni rehti hain?', 'Late videos', 'Is hafte', 'Workload', 'Deliverables', 'Payment']
      .concat(S.get().clients.slice(0, 4).map(c => `${c.name} ka status`));
    return `<div class="card chat">
      <div class="chat-log">${ui.chat.map(m => `<div class="msg ${m.me ? 'me' : 'bot'}">${m.html}</div>`).join('')}</div>
      <div class="chips">${chips.map(c => `<button data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>
      <form class="chat-form" id="chat-form"><input id="chat-input" placeholder="Agent se poochein… (e.g. kis client ka kitna kaam baqi hai?)" autocomplete="off"><button class="btn primary">Send</button></form>
    </div>`;
  }

  function askAgent(q) {
    if (!q.trim()) return;
    ui.chat.push({ me: true, html: esc(q) });
    ui.chat.push({ me: false, html: Agent.ask(q) });
    render();
    const input = $('#chat-input');
    if (input) input.focus();
  }

  // ================= Settings =================
  function viewSettings() {
    const st = S.get().settings;
    return `<div class="grid grid-2">
      <div class="card">
        <div class="card-head"><h2>👤 Profile</h2></div>
        <form id="settings-form" class="form-grid">
          <div class="full"><label for="set-name">Aap ka naam</label><input id="set-name" value="${esc(st.editorName)}" placeholder="e.g. Hamza"></div>
          <div><label for="set-cur">Currency</label><input id="set-cur" value="${esc(st.currency)}"></div>
          <div><label for="set-lock">Auto-lock (minutes, 0 = off)</label><input id="set-lock" type="number" min="0" value="${esc(st.autoLock)}"></div>
          <div class="full"><button class="btn primary">Save</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><h2>🔐 Security code</h2></div>
        <form id="code-form" class="form-grid">
          <div class="full"><label for="code-old">Purana code</label><input id="code-old" type="password"></div>
          <div><label for="code-new">Naya code</label><input id="code-new" type="password"></div>
          <div><label for="code-new2">Naya code dobara</label><input id="code-new2" type="password"></div>
          <div class="full"><button class="btn primary">Code badlein</button></div>
        </form>
        <p class="tiny muted">Data AES-256-GCM se encrypted hai; key aap ke code se banti hai. 5 ghalat koshishon par lock-out lagta hai.</p>
      </div>
      <div class="card">
        <div class="card-head"><h2>💾 Backup</h2></div>
        <p class="muted" style="margin-top:0">Data sirf is browser me hai. Hafte me ek dafa backup download kar lein. Backup file encrypted <b>nahi</b> hoti — use safe jagah rakhein.</p>
        <div class="row"><button class="btn" data-action="export">⬇️ Backup download</button><label class="btn" style="margin:0;color:var(--text);font-size:14px">⬆️ Backup restore<input type="file" id="import-file" accept="application/json" hidden></label></div>
      </div>
      <div class="card">
        <div class="card-head"><h2>🧪 Data</h2></div>
        <div class="row"><button class="btn" data-action="sample">✨ Sample data load</button><button class="btn danger" data-action="wipe-data">🗑️ Saara data clear</button></div>
        <p class="tiny muted">Sample data aap ke maujooda data me add hota hai — try karne ke liye acha hai.</p>
      </div>
    </div>`;
  }

  // ================= Modals =================
  function openModal(html, narrow = false) {
    $('#modal-body').innerHTML = html;
    $('.modal-box').classList.toggle('narrow', narrow);
    $('#modal').hidden = false;
    const first = $('#modal-body input, #modal-body select, #modal-body textarea');
    if (first) first.focus();
  }

  function closeModal() {
    $('#modal').hidden = true;
    $('#modal-body').innerHTML = '';
  }

  $('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  function clientModal(id) {
    const c = id ? S.client(id) : { name: '', platform: '', contact: '', monthlyTarget: '', rate: '', notes: '', color: S.COLORS[S.get().clients.length % S.COLORS.length] };
    openModal(`
      <h2>${id ? 'Client edit' : 'Naya client'}</h2>
      <form id="client-form" class="form-grid" style="margin-top:14px">
        <div class="full"><label for="c-name">Naam *</label><input id="c-name" required value="${esc(c.name)}"></div>
        <div><label for="c-platform">Platform</label><input id="c-platform" list="platforms" value="${esc(c.platform)}" placeholder="Instagram, YouTube…">
          <datalist id="platforms"><option>Instagram</option><option>YouTube</option><option>TikTok</option><option>Facebook</option><option>LinkedIn</option><option>Multiple</option></datalist></div>
        <div><label for="c-contact">Contact</label><input id="c-contact" value="${esc(c.contact)}" placeholder="Phone / email / @handle"></div>
        <div><label for="c-target">Monthly target (videos)</label><input id="c-target" type="number" min="0" value="${esc(c.monthlyTarget)}"></div>
        <div><label for="c-rate">Rate per video</label><input id="c-rate" type="number" min="0" value="${esc(c.rate)}"></div>
        <div><label for="c-color">Color</label><input id="c-color" type="color" value="${esc(c.color)}" style="height:40px;padding:4px"></div>
        <div class="full"><label for="c-notes">Brand / style notes</label><textarea id="c-notes" placeholder="Fonts, colors, music vibe, editing style, do's & don'ts…">${esc(c.notes)}</textarea></div>
        <div class="full modal-actions">
          ${id ? '<button type="button" class="btn danger left" data-action="delete-client">🗑️ Delete</button>' : ''}
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>`, true);
    $('#client-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#c-name').value.trim();
      if (!name) return;
      const dupe = S.findClientByName(name);
      if (dupe && dupe.id !== id) return toast('Is naam ka client pehle se hai.');
      S.saveClient({
        ...(id ? { id } : {}),
        name,
        platform: $('#c-platform').value.trim(),
        contact: $('#c-contact').value.trim(),
        monthlyTarget: Number($('#c-target').value) || 0,
        rate: Number($('#c-rate').value) || 0,
        color: $('#c-color').value,
        notes: $('#c-notes').value.trim()
      });
      closeModal();
      toast('Client save ho gaya ✅');
      render();
    });
    const del = $('[data-action="delete-client"]');
    if (del) del.addEventListener('click', () => {
      const n = S.clientVideos(id).length;
      if (confirm(`"${c.name}" aur us ki ${n} videos delete karni hain?`)) {
        S.deleteClient(id);
        if (ui.filter.client === id) ui.filter.client = '';
        closeModal();
        render();
      }
    });
  }

  function videoModal(id, presetClient) {
    const st = S.get();
    if (!st.clients.length) {
      toast('Pehle client add karein');
      return clientModal();
    }
    const firstClient = presetClient || ui.filter.client || st.clients[0].id;
    const v = id ? JSON.parse(JSON.stringify(S.video(id))) : {
      title: '', clientId: firstClient, type: 'reel', status: 'planned', priority: 'medium',
      dueDate: '', estHours: '', footageLink: '', amount: (S.client(firstClient) || {}).rate || 0, paid: false, revisions: 0,
      deliverables: S.defaultDeliverables('reel'), content: {}
    };
    v.content = v.content || {};
    let deliverables = v.deliverables || [];
    const c = S.client(v.clientId);

    const checklist = () => deliverables.map((d, i) => `
      <div class="check ${d.done ? 'done' : ''}"><input type="checkbox" data-del-check="${i}" ${d.done ? 'checked' : ''} aria-label="${esc(d.label)}"><span>${esc(d.label)}</span><button type="button" class="x" data-del-remove="${i}" aria-label="Remove">×</button></div>`).join('') || '<p class="tiny muted">Koi deliverable nahi.</p>';

    openModal(`
      <div class="row"><h2 style="flex:1">${id ? 'Video details' : 'Nayi video'}</h2>${id ? statusChip(v.status) : ''}</div>
      ${c && c.notes ? `<p class="tiny muted" style="margin:6px 0 0">🎨 ${esc(c.name)} style: ${esc(c.notes)}</p>` : ''}
      <form id="video-form" style="margin-top:14px">
        <div class="form-grid">
          <div class="full"><label for="v-title">Title / topic *</label><input id="v-title" required value="${esc(v.title)}"></div>
          <div><label for="v-client">Client</label><select id="v-client">${st.clients.map(cl => `<option value="${cl.id}" ${cl.id === v.clientId ? 'selected' : ''}>${esc(cl.name)}</option>`).join('')}</select></div>
          <div><label for="v-type">Type</label><select id="v-type">${Object.entries(S.TYPES).map(([k, t]) => `<option value="${k}" ${k === v.type ? 'selected' : ''}>${t.label}</option>`).join('')}</select></div>
          <div><label for="v-status">Status</label><select id="v-status">${S.STATUSES.map(s => `<option value="${s.id}" ${s.id === v.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
          <div><label for="v-priority">Priority</label><select id="v-priority">${['high', 'medium', 'low'].map(p => `<option value="${p}" ${p === v.priority ? 'selected' : ''}>${p[0].toUpperCase() + p.slice(1)}</option>`).join('')}</select></div>
          <div><label for="v-due">Deadline</label><input id="v-due" type="date" value="${esc(v.dueDate)}"></div>
          <div><label for="v-hours">Estimated hours (khali = auto)</label><input id="v-hours" type="number" min="0" step="0.25" value="${esc(v.estHours)}" placeholder="${(S.TYPES[v.type] || {}).hours}h"></div>
          <div><label for="v-amount">Amount</label><input id="v-amount" type="number" min="0" value="${esc(v.amount)}"></div>
          <div><label for="v-rev">Revisions</label><input id="v-rev" type="number" min="0" value="${esc(v.revisions || 0)}"></div>
          <div class="full"><label for="v-footage">Footage / Drive link</label><input id="v-footage" value="${esc(v.footageLink)}" placeholder="https://drive.google.com/…"></div>
          <div class="full"><label class="row" style="color:var(--text);font-size:14px"><input type="checkbox" id="v-paid" ${v.paid ? 'checked' : ''}> Payment mil gayi</label></div>
        </div>

        <div class="section-title">🧠 Content brief</div>
        <div class="form-grid">
          <div class="full"><label for="v-hook">Hook (pehle 3 seconds)</label><input id="v-hook" value="${esc(v.content.hook)}" placeholder="Viewer ko rokne wali line / shot"></div>
          <div class="full"><label for="v-script">Script / talking points</label><textarea id="v-script">${esc(v.content.script)}</textarea></div>
          <div><label for="v-refs">References / inspiration</label><input id="v-refs" value="${esc(v.content.refs)}" placeholder="Links"></div>
          <div><label for="v-music">Music / SFX</label><input id="v-music" value="${esc(v.content.music)}" placeholder="Trending audio, mood"></div>
          <div><label for="v-cta">CTA</label><input id="v-cta" value="${esc(v.content.cta)}" placeholder="Follow, DM, link in bio…"></div>
          <div><label for="v-caption">Caption / hashtags</label><input id="v-caption" value="${esc(v.content.caption)}"></div>
          <div class="full"><label for="v-notes">Notes / client feedback</label><textarea id="v-notes">${esc(v.content.notes)}</textarea></div>
        </div>

        <div class="section-title">📦 Deliverables</div>
        <div class="checklist" id="del-list">${checklist()}</div>
        <div class="row" style="margin-top:8px">
          <input id="del-new" placeholder="Custom deliverable add karein…" style="flex:1">
          <button type="button" class="btn small" data-action="del-add">＋ Add</button>
          <button type="button" class="btn small" data-action="del-preset">↺ Type preset</button>
        </div>

        <div class="modal-actions">
          ${id ? '<button type="button" class="btn danger left" data-action="delete-video">🗑️ Delete</button>' : ''}
          ${id ? '<button type="button" class="btn left" data-action="dup-video">⧉ Duplicate</button>' : ''}
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>`);

    const redraw = () => { $('#del-list').innerHTML = checklist(); };
    $('#del-list').addEventListener('click', e => {
      const cb = e.target.closest('[data-del-check]');
      if (cb) { deliverables[cb.dataset.delCheck].done = cb.checked; redraw(); }
      const rm = e.target.closest('[data-del-remove]');
      if (rm) { deliverables.splice(Number(rm.dataset.delRemove), 1); redraw(); }
    });
    const addDel = () => {
      const val = $('#del-new').value.trim();
      if (!val) return;
      deliverables.push({ label: val, done: false });
      $('#del-new').value = '';
      redraw();
    };
    $('[data-action="del-add"]').addEventListener('click', addDel);
    $('#del-new').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addDel(); } });
    $('[data-action="del-preset"]').addEventListener('click', () => {
      const existing = new Set(deliverables.map(d => d.label));
      S.defaultDeliverables($('#v-type').value).forEach(d => { if (!existing.has(d.label)) deliverables.push(d); });
      redraw();
    });
    $('#v-type').addEventListener('change', () => {
      $('#v-hours').placeholder = `${S.TYPES[$('#v-type').value].hours}h`;
      if (!id && !deliverables.some(d => d.done)) { deliverables = S.defaultDeliverables($('#v-type').value); redraw(); }
    });
    $('#v-client').addEventListener('change', () => {
      if (!id) $('#v-amount').value = (S.client($('#v-client').value) || {}).rate || 0;
    });

    const collect = () => ({
      ...(id ? { id } : {}),
      title: $('#v-title').value.trim(),
      clientId: $('#v-client').value,
      type: $('#v-type').value,
      status: $('#v-status').value,
      priority: $('#v-priority').value,
      dueDate: $('#v-due').value,
      estHours: $('#v-hours').value ? Number($('#v-hours').value) : '',
      amount: Number($('#v-amount').value) || 0,
      revisions: Number($('#v-rev').value) || 0,
      footageLink: $('#v-footage').value.trim(),
      paid: $('#v-paid').checked,
      deliverables,
      content: {
        hook: $('#v-hook').value.trim(),
        script: $('#v-script').value.trim(),
        refs: $('#v-refs').value.trim(),
        music: $('#v-music').value.trim(),
        cta: $('#v-cta').value.trim(),
        caption: $('#v-caption').value.trim(),
        notes: $('#v-notes').value.trim()
      }
    });

    $('#video-form').addEventListener('submit', e => {
      e.preventDefault();
      const data = collect();
      if (!data.title) return;
      if (data.status === 'delivered' && deliverables.some(d => !d.done) &&
        !confirm('Kuch deliverables abhi tick nahi hue. Phir bhi Delivered mark karein?')) return;
      S.saveVideo(data);
      closeModal();
      toast('Video save ho gayi ✅');
      render();
    });

    const del = $('[data-action="delete-video"]');
    if (del) del.addEventListener('click', () => {
      if (confirm('Ye video delete karni hai?')) { S.deleteVideo(id); closeModal(); render(); }
    });
    const dup = $('[data-action="dup-video"]');
    if (dup) dup.addEventListener('click', () => {
      const data = collect();
      delete data.id;
      S.saveVideo({
        ...data,
        title: data.title + ' (copy)',
        status: 'planned',
        paid: false,
        revisions: 0,
        deliveredAt: null,
        deliverables: deliverables.map(d => ({ label: d.label, done: false }))
      });
      closeModal();
      toast('Duplicate ban gayi');
      render();
    });
  }

  // ================= Global events =================
  document.addEventListener('click', async e => {
    if ($('#app').hidden) return;
    const t = e.target;

    const go = t.closest('[data-goto]');
    if (go) return navigate(go.dataset.goto);

    const openV = t.closest('[data-open-video]');
    if (openV && !t.closest('.modal')) return videoModal(openV.dataset.openVideo);

    const cv = t.closest('[data-client-videos]');
    if (cv) { ui.filter = { client: cv.dataset.clientVideos, status: '', q: '' }; return navigate('videos'); }

    const ec = t.closest('[data-edit-client]');
    if (ec) return clientModal(ec.dataset.editClient);

    const nv = t.closest('[data-new-video-for]');
    if (nv) return videoModal(null, nv.dataset.newVideoFor);

    const mode = t.closest('[data-mode]');
    if (mode) { ui.videoMode = mode.dataset.mode; return render(); }

    const ask = t.closest('[data-ask]');
    if (ask) return askAgent(ask.dataset.ask);

    const a = t.closest('[data-action]');
    if (!a) return;
    switch (a.dataset.action) {
      case 'new-video': return videoModal();
      case 'new-client': return clientModal();
      case 'close-modal': return closeModal();
      case 'lock': return lockApp();
      case 'toggle-theme': {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        try { localStorage.setItem('vea_theme', next); } catch { /* ignore */ }
        return;
      }
      case 'sample':
        S.loadSample();
        toast('Sample data load ho gaya ✨');
        return navigate('dashboard');
      case 'planner-preview': {
        const text = $('#planner-text').value;
        if (!text.trim()) return toast('Pehle planner paste karein');
        ui.plannerRows = S.parsePlanner(text, $('#planner-client').value);
        render();
        if (!ui.plannerRows.length) toast('Koi line nahi mili');
        return;
      }
      case 'planner-cancel':
        ui.plannerRows = null;
        return render();
      case 'planner-import': {
        const r = S.importPlanner(ui.plannerRows);
        ui.plannerRows = null;
        toast(`${r.created} videos import hui${r.newClients ? `, ${r.newClients} naye clients` : ''} ✅`);
        return render();
      }
      case 'export': {
        const blob = new Blob([JSON.stringify(S.get(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `editdesk-backup-${S.today()}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return toast('Backup download ho gaya');
      }
      case 'wipe-data':
        if (prompt('Saare clients aur videos delete ho jayenge (code wahi rahega). Confirm ke liye DELETE likhein:') === 'DELETE') {
          const settings = S.get().settings;
          S.replaceAll({ ...S.empty(), settings });
          toast('Data clear ho gaya');
          render();
        }
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'f-q') {
      ui.filter.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const inp = $('#f-q');
      inp.focus();
      inp.setSelectionRange(pos, pos);
    }
  });

  document.addEventListener('change', async e => {
    const id = e.target.id;
    if (id === 'f-client') { ui.filter.client = e.target.value; render(); }
    if (id === 'f-status') { ui.filter.status = e.target.value; render(); }
    if (id === 'import-file') {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.clients) || !Array.isArray(data.videos)) throw new Error('Invalid backup');
        if (!confirm(`Backup me ${data.clients.length} clients aur ${data.videos.length} videos hain. Maujooda data replace karna hai?`)) return;
        S.replaceAll(data);
        toast('Backup restore ho gaya ✅');
        navigate('dashboard');
      } catch {
        toast('Ye file sahi backup nahi hai');
      }
    }
  });

  document.addEventListener('submit', async e => {
    if (e.target.id === 'chat-form') {
      e.preventDefault();
      askAgent($('#chat-input').value);
    }
    if (e.target.id === 'settings-form') {
      e.preventDefault();
      Object.assign(S.get().settings, {
        editorName: $('#set-name').value.trim(),
        currency: $('#set-cur').value.trim() || 'PKR',
        autoLock: Math.max(0, Number($('#set-lock').value) || 0)
      });
      S.persist();
      resetIdle();
      toast('Settings save ho gayi ✅');
    }
    if (e.target.id === 'code-form') {
      e.preventDefault();
      const oldC = $('#code-old').value;
      const n1 = $('#code-new').value;
      const n2 = $('#code-new2').value;
      if (n1.length < 4) return toast('Naya code kam se kam 4 characters');
      if (n1 !== n2) return toast('Naye codes match nahi kar rahe');
      try {
        await Vault.unlock(oldC);
      } catch {
        return toast('Purana code ghalat hai');
      }
      await Vault.changeCode(n1, S.get());
      e.target.reset();
      toast('Security code badal gaya 🔐');
    }
  });

  // ================= Boot =================
  showLock();
})();
