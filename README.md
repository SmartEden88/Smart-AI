# Smart AI Advanced

A student-focused multi-subject learning platform upgraded from the supplied Smart AI source. This release keeps the existing static HTML/CSS/JavaScript client and Supabase browser authentication, and adds a separate Python FastAPI service for Groq requests.

## What's included

### Implemented in source
- Supabase email registration, login, logout and password-reset email flow.
- Multi-subject tutor, explain and hint modes with level-aware teaching instructions.
- Animated blue-and-white robot guide with ready, listening, thinking and celebration states.
- Five-question MCQ quiz generation, client-side marking, explanations and saved results.
- Flashcard creation and navigation.
- Five-day study plan generation.
- Saved lesson/quiz history, isolated by Supabase Row Level Security.
- Browser speech recognition when available; graceful typed-input fallback.
- Spoken tutor responses using browser speech synthesis when available.
- PNG/JPEG/WebP question-image upload (5 MB max) sent to a configurable Groq vision model.
- Responsive styling, keyboard-friendly controls and reduced-motion support.
- FastAPI backend with Supabase bearer-token verification, request validation, CORS allowlist and per-process rate limiting.
- Supabase profile, topic-progress and future role tables with RLS.
- Health endpoint and basic backend tests.

### Not yet implemented / not claimed
- No live registration/login test can be completed without your Supabase project credentials and email settings.
- No live Groq tutoring, vision-model, voice microphone or deployment test can be completed from this offline source package.
- Adaptive practice is not yet an automated mastery algorithm; topic progress schema is provided as a foundation.
- No full study-calendar planner, achievements engine, teacher/parent dashboard or linked family accounts yet.
- No official WAEC/NECO/UTME question bank or exam-board endorsement. The tutor can generate general exam-style practice, not verified past papers.
- The old Netlify Function remains in the repository as a legacy fallback. The recommended deployment uses the new FastAPI service on Render.

## Architecture

- Frontend: `public/` hosted on Netlify.
- Authentication and PostgreSQL: Supabase Auth + Postgres + RLS.
- AI backend: `backend/main.py` on Render (FastAPI).
- AI provider: Groq; API keys stay on the backend.
- Photo questions: configurable Groq vision model via `GROQ_VISION_MODEL`.

## 1. Supabase setup

1. Create a project at https://supabase.com/.
2. Open **SQL Editor** and run the complete `supabase-schema.sql`.
3. In **Authentication → URL Configuration**, set the Site URL to your deployed Netlify URL. Add redirect URLs for:
   - `https://YOUR-SITE.netlify.app/auth.html`
   - `http://localhost:8888/auth.html` (local development)
4. In **Authentication → Providers → Email**, choose whether email confirmation is required.
5. Copy the project URL and public anon/publishable key from Project Settings → API. The browser key is public by design; RLS is essential. Never use a service-role key in the browser.

## 2. Deploy the backend to Render

1. Push this project to a GitHub repository (steps below).
2. In Render, choose **New → Blueprint** and select the repository. Render reads the repository-root `render.yaml`. Or create a Python web service with root directory `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Add these environment variables in Render:
   - `GROQ_API_KEY` — secret Groq key.
   - `SUPABASE_URL` — Supabase project URL.
   - `SUPABASE_ANON_KEY` — Supabase public anon key, used only server-side to validate student JWTs.
   - `ALLOWED_ORIGINS` — exact frontend origins, comma-separated, e.g. `https://YOUR-SITE.netlify.app,http://localhost:8888`.
   - `GROQ_MODEL` — optional text model available to your Groq account. Default: `openai/gpt-oss-120b`.
   - `GROQ_VISION_MODEL` — optional vision-capable model available to your Groq account. Default: `meta-llama/llama-4-scout-17b-16e-instruct`.
4. Deploy. Check `https://YOUR-RENDER-SERVICE.onrender.com/health`; expect `{"status":"ok","service":"smart-ai-api"}`.
5. Render free web services spin down after 15 minutes without inbound traffic and may take about a minute to wake. Render free instances have other limits and are intended for testing/hobby projects rather than production. Netlify Free currently uses a monthly credit allowance; sites can pause when the allowance is reached. Check both providers’ current pricing pages before launch.

## 3. Configure and deploy the Netlify frontend

1. In `public/config.js`, set:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `API_BASE_URL` to your Render service origin, e.g. `https://YOUR-RENDER-SERVICE.onrender.com` (no trailing slash).
2. `config.js` contains only public settings. Do not add Groq or Supabase service-role secrets.
3. In Netlify, choose **Add new site → Import an existing project**, connect GitHub and select the repository.
4. Build settings:
   - Base directory: leave blank.
   - Publish directory: `public`.
   - Build command: leave blank (or `npm run build`).
5. Deploy, then add the final Netlify domain to Render's `ALLOWED_ORIGINS` and Supabase's allowed redirect URLs.

## 4. Push the project to GitHub

1. Create a new repository on https://github.com/ (for example `smart-ai-advanced`). Do not upload any API keys.
2. Extract this ZIP on your computer.
3. Open a terminal in the extracted `smart-ai-advanced` folder and run:

```bash
git init
git add .
git commit -m "Upgrade Smart AI learning platform"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/smart-ai-advanced.git
git push -u origin main
```

4. Refresh GitHub and confirm the source files are present. Connect that repository to Render and Netlify as described above.
5. For later changes:

```bash
git add .
git commit -m "Describe your update"
git push
```

Netlify and Render can automatically redeploy when the connected branch changes.

## 5. Local development

Frontend (Netlify CLI):

```bash
npm install
npx netlify dev
```

Backend in another terminal:

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
export GROQ_API_KEY="..." SUPABASE_URL="..." SUPABASE_ANON_KEY="..."
export ALLOWED_ORIGINS="http://localhost:8888"
uvicorn main:app --reload --port 8000
```

For local frontend development set `API_BASE_URL` in `public/config.js` to `http://localhost:8000`.

## Environment variable reference

| Variable | Where | Required | Purpose |
|---|---|---:|---|
| `GROQ_API_KEY` | Render backend | Yes | Secret AI provider credential |
| `SUPABASE_URL` | Render backend + public config | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Render backend + public config | Yes | Public anon key; backend uses it to verify JWT |
| `ALLOWED_ORIGINS` | Render backend | Yes | Comma-separated exact allowed browser origins |
| `GROQ_MODEL` | Render backend | No | Text model override |
| `GROQ_VISION_MODEL` | Render backend | No | Vision model override |
| `API_BASE_URL` | `public/config.js` | Yes | Public Render API origin |

## Security and limitations

- Never commit `.env`, Groq keys, service-role keys or student credentials.
- Supabase RLS policies restrict profile, work-session and topic-progress records to the signed-in owner.
- The backend verifies each bearer token with Supabase before calling Groq.
- The API applies a simple in-memory per-user limit (20 requests/minute per running worker). This is a basic abuse guard, not a distributed production rate limiter; use a shared store such as Redis for multi-instance production.
- CORS is an origin allowlist. Set `ALLOWED_ORIGINS` to your exact deployed origins.
- Uploaded images are processed in the request and are not written to server disk by this application. Avoid uploading sensitive personal documents.
- Use an HTTPS origin in production. Keep dependency versions reviewed and updated.
- AI output may be wrong; students should verify important facts with teachers and trusted learning materials.

## Verification report

Checks performed on the packaged source:
- Python syntax compilation: run during packaging.
- JavaScript syntax check: run during packaging where Node.js is available.
- Backend test suite: health endpoint and request validation tests included.
- ZIP integrity: checked after archive creation.

Checks requiring your credentials / deployment and therefore **not represented as passed**:
- Supabase sign-up, email confirmation, login, logout and password recovery.
- Live Groq requests for all subjects and vision requests.
- Actual microphone permission and device speech output.
- Netlify/Render live deployment, CORS between deployed origins, and production database RLS behavior.

See `TEST-REPORT.md` for the local checks performed for this build.
