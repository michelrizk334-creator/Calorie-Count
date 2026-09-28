Calorie Count v30.3.1 — Samsung Browser Install Patch

Installation-only patch on top of the v30.3 split-JS baseline.

Changes:
- Captures beforeinstallprompt as early as possible in index.html.
- Registers the service worker early so Samsung Browser can complete installability checks sooner.
- Samsung Browser waits for its native installer event instead of falling back to manual instructions.
- Chrome/Edge behavior is preserved.
- Safari/iOS instructions are preserved.
- No changes to Meals, Seasons, Support List, Recipes, Analytics, barcode, or AI.
- Cloudflare Worker is not included and does not need updating.

Upload the root files and the js folder to GitHub, preserving the js/ directory.
