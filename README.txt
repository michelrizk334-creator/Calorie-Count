Calorie Count v29 — Meal Clear + Preconfigured AI Backend

Built directly on the working v28 Recipe Generator release.

Changes only:
1. Every Meal header now has a compact trash button. It clears all food rows in that meal after confirmation, while keeping the Meal 1–6 slots and the rest of the interface unchanged.
2. Settings now contains the AI backend URL prefilled with:
   https://calorie-count-ai.michelrizk334.workers.dev
   Barcode lookup, AI food search and recipe generation all use this setting. New users require no setup.

Everything else from v28 is preserved, including Recipes, Saved meals, Support List, barcode scanning, AI food lookup, Seasons, meal reordering and PWA installation.

Upload the root contents to the GitHub repository and commit. No Cloudflare Worker change is required for v29.


## v29.1 minor fix
- Editing an existing food inside a meal now replaces it in place instead of moving it to the bottom of that meal.
- All v29 behavior remains unchanged.
