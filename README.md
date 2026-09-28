# Calorie Count v30.3 — Split JavaScript structure

This is the same v30.3 baseline behavior, reorganized so the GitHub-side JavaScript is easier to maintain.

## JavaScript files

- `js/core.js` — default foods, localStorage/database, shared calculations, main render orchestration, tabs/settings
- `js/workouts.js` — Erg/Other workout UI and workout inputs
- `js/meals.js` — Meal 1–6 rendering, add/edit/delete foods, clear meal, drag/reorder
- `js/seasons.js` — saved days / Training Phase / Seasons accordion
- `js/support.js` — Support List, Add/Edit Food, AI food lookup
- `js/barcode.js` — camera barcode scanner + barcode lookup UI
- `js/recipes.js` — Recipe Generator, generated meal actions, Saved Meals
- `js/analytics.js` — Daily/Weekly/Monthly Analytics and charts
- `js/install.js` — responsive layout helper, service-worker registration, PWA install prompt

`index.html` now contains the HTML/CSS and loads these files in dependency order.

The Cloudflare backend is **not split**. `worker/worker.js` remains a single unchanged file.

The service worker cache includes every JS file so offline/PWA behavior is preserved.
