Calorie Count v30.2 — Analytics Balance Sign

Minor analytics-only fix on top of v30.1.
- Period Balance now uses the same sign convention as the analytics table:
  burned > consumed  -> positive (+)
  burned < consumed  -> negative (-)
  equal              -> 0
- Everything else is unchanged.
- Service-worker cache bumped to v30.2.

Upload the root contents to GitHub and commit. No Cloudflare change is required.
