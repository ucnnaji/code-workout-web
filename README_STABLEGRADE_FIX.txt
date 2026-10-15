StableGrade fallback/logging fix for Code Workout v4.0.7

Replace your repository file:
  lib/app.mjs
with:
  lib/app.mjs from this package

No database schema change is required for this fix.
The existing v4.0.7 database migration should already provide score_cache_get.
If score_cache_get fails at runtime, this updated code logs the failure and continues to OpenAI grading instead of disabling scoring.

After copying:
  npm test
  git add lib/app.mjs
  git commit -m "Allow AI grading when score cache lookup fails"
  git push origin main

After Render redeploys, trigger one grading attempt and search logs for:
  ai_score_cache_hit
  ai_score_cache_miss
  ai_score_cache_failed
  ai_grading_request_started
  ai_grading_request_succeeded
  ai_provider_grading_failed
