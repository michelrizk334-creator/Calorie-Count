# Calorie Count Worker — v27

The existing barcode route is preserved and v27 adds `POST /food-search` for ChatGPT food/meal lookup.

## Required Cloudflare secret
Add an OpenAI API key to the Worker as the secret `OPENAI_API_KEY`.
Optional variable: `OPENAI_MODEL` (defaults to `gpt-5.6-luna`).

Deploy this `worker.js` to the existing `calorie-count-ai` Worker so the public URL stays:
`https://calorie-count-ai.michelrizk334.workers.dev`

The API key stays in Cloudflare and is never placed in the browser app.
