# 🎬 EditDesk Agent

A private dashboard and agent for video editors. It tracks every client, every video, deadlines, deliverables and payments in one place. Everything is locked behind your security code.

## Features

| | |
|---|---|
| 🔐 **Security code** | On first open you set a code. All data is stored in the browser **encrypted with AES-256-GCM** (the key is derived from your code with PBKDF2, 250k iterations). Without the code the data can't be read. After 5 wrong attempts there is a lock-out, and the app auto-locks after a period of inactivity. |
| 📊 **Dashboard** | Active clients, total videos, how many are **done** and how many are **left**, late videos, estimated hours of work left, pending payments. |
| 👥 **Client-wise progress** | For each client: done/total, videos left, hours of work left, monthly target, next deadline. |
| 🤖 **Agent Brief** | Automatic alerts for late videos, deadlines within 48h, missing footage, stuck client reviews, clients behind their monthly target, unpaid invoices, and heavy weeks. |
| 🎯 **Today's plan** | Which video to work on first (by deadline and priority), plus the next step for each. |
| 🎞️ **Videos board** | A Kanban pipeline: Planned → Footage → Editing → Client Review → Revisions → Delivered (drag & drop), plus a list view with filters. |
| 🧠 **Content brief** | For each video: hook, script, references, music, CTA, caption, and client feedback. |
| 📦 **Deliverables** | An automatic checklist for each video type (e.g. a Reel gets a 9:16 export, captions and a cover; YouTube gets a thumbnail, SRT and chapters). You can add custom items. |
| 🗓️ **Planner import** | Paste a client's content planner. The agent creates the videos, detects the type, and adds the deliverables. Includes a 2-week content calendar. |
| 💬 **Agent chat** | Ask in Roman Urdu or English, e.g. "kitni videos bani", "kitni rehti hain", "aaj kya karun", "Glow Skincare ka status", "workload", "payment". |
| 💾 **Backup** | JSON backup download and restore. |

## How to run

No install or build is needed. These are plain HTML/CSS/JS files.

```bash
# Option 1: open index.html directly in Chrome/Edge
# Option 2 (recommended): run a local server
python3 -m http.server 8000
# then open http://localhost:8000
```

**To use it on your phone:** turn on GitHub Pages (Settings → Pages → Branch). Your data stays only on the device you use it on.

## Planner format

```
date | client | title | type | notes
2026-10-05 | Glow Skincare | Serum review | reel | Hook: "3 din me glow"
12/10 | TechWithAli | Laptop guide | youtube | B-roll from last shoot
Cafe Bites | Weekend deal | ad
```

You can separate fields with `|`, a tab (Excel/Sheets copy-paste) or `;`. Date and type are optional. A new client is created automatically.

## Files

```
index.html       Layout (lock screen + app)
css/styles.css   Dark/light theme, responsive UI
js/vault.js      Security code + AES-GCM encryption
js/store.js      Clients, videos, stats, planner parser
js/agent.js      Agent brief, today's plan, chat answers
js/app.js        Views, modals, events
```

## ⚠️ Important

- If you forget the code, **the data can't be recovered**. Download a backup regularly.
- Data lives only in the browser you use. Clearing the browser data deletes it.
