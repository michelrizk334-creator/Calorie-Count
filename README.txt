Calorie Count v28 — Recipe Generator

NEW
- Fourth Recipes tab with Recipe Generator.
- Generate from Support List only, or from any foods.
- Enter any combination of Protein / Carbs / Fat / Calories; at least one is required.
- Generated result shows ingredients, instructions, estimated macros/calories, and a warning that actual values may differ from goals.
- Add a generated meal directly to Meal 1–6 without saving it.
- Save favorite generated recipes under Saved meals and reuse them later.
- Saved recipe ingredients remain normal editable meal rows when added.

PRESERVED
- Meals, meal macros, drag reordering, direct meal Edit button.
- Seasons accordion.
- Support List, manual food entry, barcode scanner, AI food lookup.
- PWA install/offline workflow.

DEPLOYMENT
1. Upload the ZIP root files to the GitHub Pages repository and replace existing files.
2. Commit and wait for GitHub Pages to turn green.
3. In Cloudflare calorie-count-ai, replace Worker code with worker/worker.js.
4. Verify Workers AI binding name is exactly AI, then deploy.
5. Test Recipes tab.
