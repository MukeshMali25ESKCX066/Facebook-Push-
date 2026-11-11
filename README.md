# PageCrew

PageCrew is organized as a frontend/backend project:

- `frontend/public/` contains the production frontend build and static pages.
- `backend/` contains the compiled Node.js API and its package manifest.
- `serve-pagecrew.py` serves the frontend on port 5173 and proxies `/api/*` to the backend on port 4000.
- `backend/dist/services/ai-content.js` and `frontend/public/ai-content.*` implement the campaign AI content workflow.
- `backend/dist/services/scheduler-core.js`, `backend/dist/routes/scheduler.js`, and `frontend/public/scheduler.*` implement event-based, per-Page scheduling, calendar review, and publishing controls.
- `backend/dist/services/analytics-core.js`, `backend/dist/services/analytics-integrations.js`, `backend/dist/routes/analytics.js`, and `frontend/public/analytics.*` implement PageCrew publishing analytics, optional GA4 traffic sync, reports, and reviewed optimization suggestions.

## Run locally

1. Copy `backend/.env.example` to `backend/.env` and set private credentials. Use Node.js 22 or newer and set `GEMINI_API_KEY` in the backend environment for AI content and image generation (`AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.6-flash`, `GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1`). Captions, CTAs, hashtags, and image variations use the official Google GenAI SDK server-side; `OPENAI_API_KEY` is not required for the AI Content Generator.
2. In `backend/`, install dependencies with `npm install` if needed, then run `npm start`.
3. In a separate terminal at the project root, run `python serve-pagecrew.py`.
4. Open <http://127.0.0.1:5173>.

Complete Event & Article Selection to save a campaign and continue into the AI Content Generator. Generation runs only after a user action. Approved content is saved as a draft for review and is never published automatically. Generated content, settings, provider usage, and generation errors are stored with the encrypted campaign persistence. Configure optional `GEMINI_*_USD_*` and `OPENAI_*_USD_*` rate values using current provider pricing to record estimated USD costs; estimates are omitted when rates are unset.

Run backend unit tests with `npm test` from `backend/`.

Approve at least one AI-generated Page post to continue to Smart Scheduler. The scheduler generates a timezone-aware preview from approved content, applies independent Page daily limits and minimum gaps, adds Facebook UTM parameters, and provides day/week/month calendar views with post editing and rescheduling. Schedule generation and campaign start are separate actions: publishing begins only after the user approves the schedule. Scheduled campaigns are persisted in the encrypted `scheduler.enc` store and are processed by the running Node.js backend every 30 seconds; each Page publish is recorded, failures receive up to two delayed retries, and an ambiguous in-flight publish after a restart is held for manual review to avoid accidental duplicates.

The current deployment has no Redis/BullMQ or Page Insights integration. The scheduler therefore uses the existing persistent Node.js worker model and makes no unsupported claim about universally optimal publishing hours: its initial slots follow the selected timezone and posting window. Keep the backend process running for automatic publishing, set `ENCRYPTION_KEY`, and reconnect/load Facebook Pages before campaign posts are due. Scheduler endpoints are mounted under `/api/scheduler`.

The Analytics page is available at `/analytics.html`; its workspace-scoped endpoints are mounted under `/api/analytics`. Published post insights are fetched from Meta on demand and remain N/A until sync succeeds; unsupported metrics or missing permissions are not fabricated. Reconnect/load Facebook Pages before syncing so Page access tokens are available. GA4 is optional: set `GA4_PROPERTY_ID` and `GA4_SERVICE_ACCOUNT_JSON` in the private backend environment, share the GA4 property with that service account as a Viewer, and use the GA4 Data API. UTM-attributed GA4 sessions are displayed separately from Facebook link clicks. Analytics AI optimization recommendations continue to use the optional OpenAI API and require `OPENAI_API_KEY`; suggestions do not modify or publish content, and users must approve or reject them. Reports support CSV, Excel-compatible CSV, and a printable page for saving as PDF. Best-time comparisons are observational and show low confidence when there is limited history.

Configure local secrets and service settings in `backend/.env`. Do not commit that file.

The deployed frontend proxies `/api/*` to `https://facebook-push.onrender.com`; therefore, set `GEMINI_API_KEY` (and optionally `AI_PROVIDER=gemini`, `GEMINI_MODEL=gemini-3.6-flash`, and `GEMINI_IMAGE_MODEL=gemini-nano-banana-2.1`) in the backend host's environment variables, then restart/redeploy that backend. A Vercel-only environment variable is not forwarded by this proxy to the Render API. Keep the Gemini key server-side; it is never sent to the browser.

To test the backend's Gemini connectivity while signed in, send `POST /api/campaigns/ai/health`. It performs a small request with the configured model and reports whether the backend loaded the key, the model used, and sanitized provider status details; it never returns the key.

This checkout contains the built frontend and compiled backend output; the original frontend and backend source files are not included.
