# Calorie Count Cloudflare Worker — v28

This Worker preserves `/barcode/` and `/food-search` and adds `/recipe-generate`.
It uses the existing Cloudflare Workers AI binding named `AI`; no OpenAI API key is required.
Replace the deployed Worker code with `worker.js`, verify the AI binding is still named `AI`, then deploy.
