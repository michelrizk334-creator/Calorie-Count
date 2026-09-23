# Calorie Count v22 AI scanner backend

Deploy this folder as a Cloudflare Worker (or adapt `worker.js` to another serverless host).

1. Create a Worker.
2. Add `OPENAI_API_KEY` as a **secret**. Never put it in `index.html` or GitHub Pages.
3. Optional: set `OPENAI_MODEL` if you want to use another vision-capable model.
4. Deploy the Worker and copy its `https://...workers.dev` URL.
5. In Calorie Count, open **Settings** and paste that URL into **AI label scanner endpoint**.

The frontend sends only the label photo you explicitly choose to scan. Meals and tracker data remain in browser local storage.
