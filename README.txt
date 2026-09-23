Calorie Count v22 — AI Nutrition Label Scanner

Based on the stable v21.2 responsive version.

NEW:
- Support List > + Add food > Scan nutrition label.
- Take a photo or choose an image from the phone.
- AI extracts the label's reference amount/unit, calories, carbs, protein and fat.
- Handles per 100 g, per 100 ml, serving amounts, and per-unit labels.
- Prefills the existing Add Food form; NOTHING is auto-saved.
- User must review and press Save food.
- Scanner warns when a value/basis needs verification.
- Manual Add Food still works normally.
- Existing tracker data remains local.

SECURITY:
GitHub Pages must NOT contain an OpenAI API key. The included /worker folder is a secure
serverless backend starter. Deploy it, add OPENAI_API_KEY as a secret, then paste the
Worker URL into Settings > AI label scanner endpoint.

The scanner requires internet access. The rest of the PWA remains offline-capable.


v22.1: Scanner now has separate Take photo and Upload image buttons. Both feed the same AI reader.
