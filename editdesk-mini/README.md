# EditDesk Mini

A small dark dashboard for Faisal (video editor, Swiftwave Digital): today's tasks, a colored section per client with a monthly reels target, an alternating-Saturday work calendar, and notes.

## Run

Open `index.html` in a browser. No build step and no dependencies (fonts load from Google Fonts; offline it falls back to system fonts).

Or serve it:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Data

- Outside claude.ai, everything is saved in the browser's `localStorage` under the key `editdesk-mini-db-v1` (see `window.LocalDB` in `index.html`).
- On first run it is seeded with the October clients from `data/seed-clients.json` (same data is inlined in `index.html`).
- Clear the key in DevTools to start over. `LocalDB.exportAll()` / `LocalDB.importAll(json)` in the console back up and restore.
- Inside claude.ai the same page uses the artifact database (`window.claude.use('db')`) instead.

## Data shape

| Path | Fields |
|---|---|
| `clients/<id>` | `name, status (active/new/confirm), reelsTarget, reelsDone, notes, order, color` |
| `videos/<id>` | `title, clientId, client, type ('reel'), due (YYYY-MM-DD), status, deliverables[{label, done}], deliveredAt` |
| `tasks/<id>` | `title, client, date (YYYY-MM-DD), done, createdAt` |
| `routine/<YYYY-MM-DD>` | `{ <routineKey>: true }` |
| `schedule/saturdays` | `overrides: { 'YYYY-MM-DD': 'on' | 'off' }` |
| `notes/main` | `text, updatedAt` |

## Rules worth knowing

- Saturdays alternate: Sat 3 Oct 2026 is off, then working, off, … (`SAT_ANCHOR` in the script). Sundays are always off. Tapping a Saturday in the Month tab stores an override.
- Marking a reel **Delivered** adds 1 to its client's `reelsDone`; moving it back subtracts 1.
- "Reels / day needed" = reels left ÷ working days left this month (today included).
