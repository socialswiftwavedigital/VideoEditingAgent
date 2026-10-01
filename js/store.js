/*
 * Store — clients, videos, settings aur saari calculations.
 */
const Store = (() => {
  const TYPES = {
    reel: {
      label: 'Reel / Short (9:16)', hours: 2,
      deliverables: ['9:16 export (1080×1920)', 'Captions burned-in', 'Cover / thumbnail frame', 'Hook in first 3 sec', 'Music / SFX licensed']
    },
    youtube: {
      label: 'YouTube Long-form (16:9)', hours: 8,
      deliverables: ['16:9 export (4K / 1080p)', 'Thumbnail (1280×720)', 'SRT subtitles', 'Chapters / timestamps', 'End screen + cards', 'Color grade + audio mix']
    },
    ad: {
      label: 'Ad / Promo', hours: 4,
      deliverables: ['9:16 version', '1:1 version', '16:9 version', 'CTA end card', 'Brand logo + colors', 'Captions']
    },
    podcast: {
      label: 'Podcast / Interview', hours: 5,
      deliverables: ['Full episode export', '3–5 short clips (9:16)', 'Audio cleanup', 'Thumbnail', 'Captions']
    },
    thumbnail: {
      label: 'Thumbnail only', hours: 0.75,
      deliverables: ['Thumbnail (1280×720)', '2 variations for A/B']
    },
    other: {
      label: 'Other', hours: 3,
      deliverables: ['Final export', 'Project file archived']
    }
  };

  const STATUSES = [
    { id: 'planned', label: 'Planned', next: 'Script / footage confirm karo' },
    { id: 'footage', label: 'Footage Received', next: 'Rough cut start karo' },
    { id: 'editing', label: 'Editing', next: 'Edit complete karo + deliverables check' },
    { id: 'review', label: 'Client Review', next: 'Client se feedback follow-up' },
    { id: 'revision', label: 'Revisions', next: 'Revisions laga kar re-export' },
    { id: 'delivered', label: 'Delivered', next: 'Payment confirm karo' }
  ];

  // Kitna kaam baqi hai, status ke hisaab se (1 = poora baqi).
  const STATUS_LEFT = { planned: 1, footage: 1, editing: 0.55, review: 0.1, revision: 0.3, delivered: 0 };
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const COLORS = ['#7c5cff', '#22c3a6', '#ff7a59', '#3ea8ff', '#f5b82e', '#e5579a', '#8bd450', '#9a7bff'];

  let state = empty();
  let saveTimer = null;
  let onSaved = () => {};

  function empty() {
    return {
      version: 1,
      settings: { editorName: '', currency: 'PKR', autoLock: 10 },
      clients: [],
      videos: [],
      activity: []
    };
  }

  function load(data) {
    const base = empty();
    state = {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data && data.settings) },
      clients: (data && data.clients) || [],
      videos: (data && data.videos) || [],
      activity: (data && data.activity) || []
    };
  }

  function get() {
    return state;
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await Vault.save(state);
        onSaved(true);
      } catch (e) {
        console.error(e);
        onSaved(false);
      }
    }, 250);
  }

  function setOnSaved(fn) {
    onSaved = fn;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function log(text) {
    state.activity.unshift({ at: Date.now(), text });
    state.activity = state.activity.slice(0, 60);
  }

  // ---------- Dates ----------
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function dateStr(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function today() {
    return dateStr(new Date());
  }

  function addDays(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }

  function daysUntil(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - t0) / 86400000);
  }

  function fmtDate(str) {
    if (!str) return '—';
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function relDay(str) {
    const n = daysUntil(str);
    if (n === null) return 'No date';
    if (n === 0) return 'Aaj';
    if (n === 1) return 'Kal';
    if (n === -1) return 'Kal guzar gaya';
    if (n < 0) return `${-n} din late`;
    return `${n} din baqi`;
  }

  // ---------- Clients ----------
  function client(id) {
    return state.clients.find(c => c.id === id);
  }

  function saveClient(data) {
    if (data.id) {
      Object.assign(client(data.id), data);
      log(`Client update: ${data.name}`);
    } else {
      const c = {
        id: uid(),
        color: COLORS[state.clients.length % COLORS.length],
        createdAt: Date.now(),
        ...data
      };
      state.clients.push(c);
      log(`Naya client: ${c.name}`);
      data = c;
    }
    persist();
    return data;
  }

  function deleteClient(id) {
    const c = client(id);
    state.clients = state.clients.filter(x => x.id !== id);
    state.videos = state.videos.filter(v => v.clientId !== id);
    if (c) log(`Client delete: ${c.name}`);
    persist();
  }

  function findClientByName(name) {
    const n = name.trim().toLowerCase();
    return state.clients.find(c => c.name.trim().toLowerCase() === n);
  }

  // ---------- Videos ----------
  function video(id) {
    return state.videos.find(v => v.id === id);
  }

  function defaultDeliverables(type) {
    return (TYPES[type] || TYPES.other).deliverables.map(label => ({ label, done: false }));
  }

  function saveVideo(data) {
    const existing = data.id && video(data.id);
    if (existing) {
      if (existing.status !== data.status) {
        data.statusChangedAt = Date.now();
        if (data.status === 'delivered') data.deliveredAt = Date.now();
        log(`"${data.title}" → ${statusLabel(data.status)}`);
      }
      Object.assign(existing, data);
      persist();
      return existing;
    }
    const v = {
      id: uid(),
      type: 'reel',
      status: 'planned',
      priority: 'medium',
      deliverables: defaultDeliverables(data.type || 'reel'),
      content: {},
      revisions: 0,
      amount: 0,
      paid: false,
      createdAt: Date.now(),
      statusChangedAt: Date.now(),
      ...data
    };
    if (v.status === 'delivered' && !v.deliveredAt) v.deliveredAt = Date.now();
    state.videos.push(v);
    log(`Nayi video: "${v.title}"`);
    persist();
    return v;
  }

  function setStatus(id, status) {
    const v = video(id);
    if (!v || v.status === status) return;
    if (status === 'revision' && v.status === 'review') v.revisions = (v.revisions || 0) + 1;
    saveVideo({ ...v, status });
  }

  function deleteVideo(id) {
    const v = video(id);
    state.videos = state.videos.filter(x => x.id !== id);
    if (v) log(`Video delete: "${v.title}"`);
    persist();
  }

  function statusLabel(id) {
    return (STATUSES.find(s => s.id === id) || {}).label || id;
  }

  // ---------- Calculations ----------
  function isDone(v) {
    return v.status === 'delivered';
  }

  function isOverdue(v) {
    return !isDone(v) && v.dueDate && daysUntil(v.dueDate) < 0;
  }

  function hoursLeft(v) {
    if (isDone(v)) return 0;
    const base = Number(v.estHours) || (TYPES[v.type] || TYPES.other).hours;
    return base * (STATUS_LEFT[v.status] ?? 1);
  }

  function deliverableProgress(v) {
    const list = v.deliverables || [];
    const done = list.filter(d => d.done).length;
    return { done, total: list.length };
  }

  function thisMonth(ts) {
    if (!ts) return false;
    const d = new Date(ts);
    const n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }

  function stats(videos = state.videos) {
    const pending = videos.filter(v => !isDone(v));
    const delivered = videos.filter(isDone);
    return {
      total: videos.length,
      delivered: delivered.length,
      pending: pending.length,
      overdue: pending.filter(isOverdue).length,
      dueSoon: pending.filter(v => v.dueDate && daysUntil(v.dueDate) >= 0 && daysUntil(v.dueDate) <= 2).length,
      hoursLeft: pending.reduce((s, v) => s + hoursLeft(v), 0),
      unpaid: delivered.filter(v => !v.paid).reduce((s, v) => s + (Number(v.amount) || 0), 0),
      earnedMonth: delivered.filter(v => thisMonth(v.deliveredAt)).reduce((s, v) => s + (Number(v.amount) || 0), 0),
      deliveredMonth: delivered.filter(v => thisMonth(v.deliveredAt)).length,
      byStatus: Object.fromEntries(STATUSES.map(s => [s.id, videos.filter(v => v.status === s.id).length]))
    };
  }

  function clientVideos(id) {
    return state.videos.filter(v => v.clientId === id);
  }

  function clientStats(c) {
    const vids = clientVideos(c.id);
    const s = stats(vids);
    const next = vids
      .filter(v => !isDone(v) && v.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return { ...s, next, target: Number(c.monthlyTarget) || 0 };
  }

  // Aaj kis cheez par kaam karna chahiye — overdue pehle, phir deadline, phir priority.
  function workQueue() {
    return state.videos
      .filter(v => !isDone(v))
      .sort((a, b) => {
        const da = a.dueDate ? daysUntil(a.dueDate) : 999;
        const db = b.dueDate ? daysUntil(b.dueDate) : 999;
        if (da !== db) return da - db;
        return (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
      });
  }

  function money(n) {
    const cur = state.settings.currency || 'PKR';
    return `${cur} ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
  }

  // ---------- Planner ----------
  function detectType(text) {
    const t = (text || '').toLowerCase();
    if (/thumb/.test(t)) return 'thumbnail';
    if (/podcast|interview/.test(t)) return 'podcast';
    if (/\bad\b|ads|promo|commercial/.test(t)) return 'ad';
    if (/youtube|long|vlog|16:9|yt\b/.test(t)) return 'youtube';
    if (/reel|short|tiktok|story|9:16/.test(t)) return 'reel';
    return null;
  }

  function parseDate(s) {
    s = s.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
    if (m) {
      let y = m[3] ? Number(m[3]) : new Date().getFullYear();
      if (y < 100) y += 2000;
      return `${y}-${pad(m[2])}-${pad(m[1])}`;
    }
    return null;
  }

  /*
   * Planner format (har line ek video):
   *   date | client | title | type | notes
   * "|" , tab ya ";" se alag karein. Date aur type optional hain.
   */
  function parsePlanner(text, defaultClient) {
    const rows = [];
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      if (/^date\b|^title\b|^client\b/i.test(line)) return;
      const parts = line.split(/\s*[|\t;]\s*/).map(p => p.trim()).filter(Boolean);
      let date = null;
      const rest = [];
      parts.forEach(p => {
        const d = !date && parseDate(p);
        if (d) date = d;
        else rest.push(p);
      });
      let clientName;
      let title;
      let typeText;
      let notes;
      if (rest.length === 1) {
        clientName = defaultClient || '';
        title = rest[0];
      } else {
        [clientName, title, typeText, ...notes] = rest;
      }
      let type = detectType(typeText);
      if (!type && typeText) {
        notes = [typeText, ...(notes || [])];
      }
      notes = (notes || []).join(' | ');
      type = type || detectType(title) || 'reel';
      rows.push({
        line: i + 1,
        date,
        clientName: clientName || '',
        title: title || '',
        type,
        notes,
        error: !title ? 'Title missing' : (!clientName ? 'Client missing' : null)
      });
    });
    return rows;
  }

  function importPlanner(rows) {
    let created = 0;
    let newClients = 0;
    rows.filter(r => !r.error).forEach(r => {
      let c = findClientByName(r.clientName);
      if (!c) {
        c = saveClient({ name: r.clientName, platform: '', monthlyTarget: 0, rate: 0 });
        newClients++;
      }
      saveVideo({
        clientId: c.id,
        title: r.title,
        type: r.type,
        dueDate: r.date || '',
        amount: Number(c.rate) || 0,
        deliverables: defaultDeliverables(r.type),
        content: { notes: r.notes || '' }
      });
      created++;
    });
    log(`Planner import: ${created} videos`);
    persist();
    return { created, newClients };
  }

  // ---------- Sample data ----------
  function loadSample() {
    const a = saveClient({ name: 'Glow Skincare', platform: 'Instagram', monthlyTarget: 12, rate: 3500, contact: '@glowskin', notes: 'Soft pastel look, trending audio, captions bold white.' });
    const b = saveClient({ name: 'TechWithAli', platform: 'YouTube', monthlyTarget: 4, rate: 15000, contact: 'ali@email.com', notes: 'Fast cuts, zoom-ins, MrBeast-style retention edits.' });
    const c = saveClient({ name: 'Cafe Bites', platform: 'TikTok', monthlyTarget: 8, rate: 2500, contact: '0300-0000000', notes: 'Food close-ups, ASMR sounds, Urdu captions.' });
    const mk = (cl, title, type, status, due, extra = {}) => saveVideo({
      clientId: cl.id, title, type, status, dueDate: addDays(due), amount: cl.rate,
      deliverables: defaultDeliverables(type).map((d, i) => ({ ...d, done: status === 'delivered' || (status !== 'planned' && i < 2) })),
      ...extra
    });
    mk(a, 'Vitamin C serum — before/after', 'reel', 'delivered', -6, { paid: true });
    mk(a, '3-step night routine', 'reel', 'delivered', -2, { paid: false });
    mk(a, 'Sunscreen myths', 'reel', 'editing', 1, { priority: 'high', content: { hook: 'Kya aap bhi ye ghalti kar rahe hain?', cta: 'Link in bio' } });
    mk(a, 'Customer review compilation', 'reel', 'footage', 3);
    mk(a, 'Eid gift box unboxing', 'ad', 'planned', 6, { priority: 'high' });
    mk(b, 'iPhone vs Pixel camera test', 'youtube', 'review', 2, { content: { hook: '10,000 photos baad ye result aya…' } });
    mk(b, 'Budget gaming setup under 1 lakh', 'youtube', 'planned', 9);
    mk(b, 'Thumbnail — Best laptops 2026', 'thumbnail', 'revision', 0, { priority: 'high', revisions: 1 });
    mk(c, 'New zinger burger launch', 'ad', 'delivered', -4, { paid: true });
    mk(c, 'Behind the kitchen', 'reel', 'editing', -1, { priority: 'high' });
    mk(c, 'Weekend deal promo', 'reel', 'planned', 4);
    log('Sample data load hua');
    persist();
  }

  function replaceAll(data) {
    load(data);
    log('Backup import hua');
    persist();
  }

  return {
    TYPES, STATUSES, COLORS,
    load, get, persist, setOnSaved, uid, log,
    today, addDays, daysUntil, fmtDate, relDay,
    client, saveClient, deleteClient, findClientByName,
    video, saveVideo, setStatus, deleteVideo, statusLabel, defaultDeliverables,
    isDone, isOverdue, hoursLeft, deliverableProgress, stats, clientVideos, clientStats, workQueue, money,
    parsePlanner, importPlanner, loadSample, replaceAll, empty
  };
})();
