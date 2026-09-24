Calorie Count v27 — ChatGPT Food Lookup

GitHub Pages:
Upload/replace the root files in your Calorie-Count repository and commit.

Cloudflare Worker:
Deploy worker/worker.js to the existing calorie-count-ai Worker.
Add OPENAI_API_KEY as a Worker secret. The browser never receives this key.

New feature:
Support List > Add food now has Look up food on ChatGPT above Scan barcode.
It accepts single foods or complete meal descriptions. Add item only prefills the existing form; the user still reviews it and presses Save food.
Description / Portion is optional and existing foods remain compatible.

Preserved:
v26 Seasons accordion, v25 meal UX/reordering, barcode scanner, manual food entry, workouts, saved days, backup/restore and PWA installation.
