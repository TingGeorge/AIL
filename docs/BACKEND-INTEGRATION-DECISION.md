# ALL IN LIFE backend integration decision

Date: 2026-09-05
Branch: `codex/all-in-life-backend-plan`
Frontend baseline: `codex/all-in-life-mvp` / `mvp/`
Compared with: `origin/main` at `45f57ed`

## Decision

Use `mvp/` as the product frontend and delivery surface. Do not replace it with `main`'s `old_version/` or `prototype-v1/`.

For backend direction, take the stronger ideas from `main`, but implement them in the `mvp/` deployment model:

- Cloudflare Worker style API, because the current deploy target already uses the `mvp/` Sites/PWA shape.
- D1 migrations from this branch as the persistence base.
- `main`'s backend discipline: pre-ingested data, deterministic filtering first, two ranking agents second, shared Zod schema, timeout/error boundaries, Taipei server time, and contract tests.

In short: frontend from this branch, backend rules from `main`, runtime shape from `mvp`.

## Why not directly merge `main`

`main` and this branch are parallel implementations, not two small edits to the same app.

Direct merge currently conflicts in:

- `.gitignore`
- `docs/PRD-all-in-life.md`

There is also a larger architecture conflict even where Git can merge text:

- `main` has `old_version/` and `prototype-v1/` with Bun, Vite, Hono, local/Postgres-oriented specs.
- This branch has `mvp/` with Vinext/React/Tailwind, PWA assets, D1 schema, and Sites deployment.
- `main` uses five product categories: 食品、日用品、免費／公益資源、活動、交通.
- `mvp/` UI currently groups the experience around DINING, DAILY, LEISURE, TRANSPORT and richer mobile screens.

So the good merge is selective migration, not a raw branch merge.

## Comparison

| Area | `main` strength | Current branch strength | Pick |
| --- | --- | --- | --- |
| Frontend | Hash routing and earlier lightweight flow | Complete mobile PWA in `mvp/`, richer screens, public HTTPS deployment | Keep `mvp/`; migrate routing behavior later |
| Backend runtime | Bun/Hono prototype is simple and testable | Cloudflare/D1 direction fits hosting target | Use Worker/D1 for deploy; borrow Hono route contracts conceptually |
| Data source | Pre-ingested candidate records; no runtime web search | D1 schema models users, places, evidence, teams, reports, notifications | Use pre-ingestion rule with D1 tables |
| Search | Deterministic filter stage before agents | CP engine and evidence-first product language | Combine: evidence gate + hard filter + CP/cost ranking |
| Agents | Two ranking agents: paid and free | UI already shows CP, Team, Zero-cost stories | Keep two agents as backend rankers, not crawlers |
| Validation | Zod `Need` schema shared across client/server | `SearchConstraints` type exists but not runtime-enforced | Build shared Zod schema first |
| Dates/location | Taipei date resolved server-side; user location not saved | PWA/location UX already expected | Adopt `main` privacy and Taipei-time rules |
| Tests | Parser/routes/search contracts in Bun prototype | Build and PWA smoke checks already done | Port contract tests to `mvp` API layer |

## Recommended backend architecture

```text
mvp/ PWA frontend
  -> POST /api/v1/search/parse
  -> POST /api/v1/search
  -> GET/PATCH /api/v1/profile
  -> GET/POST /api/v1/lists
  -> GET/PATCH /api/v1/notifications
  -> POST /api/v1/reports

Cloudflare Worker API
  -> shared Zod SearchConstraints
  -> Taipei server date normalization
  -> evidence gate
  -> hard filters
  -> deterministic cost / CP ranking
  -> paid options agent + free resources agent
  -> D1 persistence

Offline ingestion jobs
  -> official/provider/public sources
  -> candidate records
  -> evidence assertions
  -> optional Places geocoding
  -> freshness/status checks
```

## Backend build order

1. Define shared `SearchConstraints` with Zod.

   Replace loose TypeScript-only assumptions with runtime validation. This should be shared by parse, search, and frontend form confirmation.

2. Implement the API client and route shell.

   Add 30 second timeout, request id, typed errors, cancellation, and a fixture fallback so the demo flow does not collapse if the backend is unavailable.

3. Bring D1 online using the existing migrations.

   Start with profile, saved lists, purchase history, notifications, and reports. These are lower AI risk and immediately improve the current frontend.

4. Implement search as deterministic first.

   Search should read pre-ingested candidates, apply evidence gate and hard filters, compute comparable cost/CP, and return sorted results without LLM first.

5. Add the two agents only after deterministic search works.

   The agents should rank already-valid candidates and write short reasons. They must not invent candidates, prices, hours, or eligibility.

6. Add ingestion/geocoding.

   Take `main`'s ingestion and geocoding rules: one source equals one record, unknown cost is not zero, expired/conflicted data leaves the main ranking, and user location is never saved.

7. Port tests.

   Move contract tests for parse/search/routes into the `mvp` backend shape. Add one browser smoke test for onboarding -> search -> result -> saved.

## What to migrate from `main`

- `needSchema` shape and the idea of one shared parser/search schema.
- `/api/parse` and `/api/transcribe` trust boundaries: input size limits, 30 second timeout, fixed error messages.
- `/api/search` event model: filter event, per-agent/per-category ranking events, done event.
- Data rules from `SPEC-ingestion.md`: one source one record, required evidence, null for unknown price, data status handling.
- Location rules from `SPEC-geocoding.md`: candidate coordinates can be stored, user coordinates are one-request-only.
- Test ideas from `prototype-v1/tests`.

## What not to migrate directly

- Do not move the frontend back to `old_version/` or `prototype-v1/`.
- Do not use local Postgres as the final deployment dependency unless the hosting target changes.
- Do not make agents perform live web search at request time.
- Do not store raw audio, transcript, or precise user location by default.
- Do not make Team a real transaction/commitment system before moderation, abuse, and privacy rules exist.

## Conflict resolution guidance

For `.gitignore`, take the union of both sides: keep build caches, local env files, temporary artifacts, and deployment output ignored.

For `docs/PRD-all-in-life.md`, keep the official product framing but align the implementation section to this decision:

- Anonymous users can search.
- Login is for saving state and shared/report actions.
- Search uses pre-ingested candidates, not runtime crawling.
- Agents rank filtered candidates; they do not create facts.
- User location is only used for the current search and is not persisted.
- The current deliverable frontend is `mvp/`.

## Final recommendation

Open a PR from `codex/all-in-life-backend-plan` or `codex/all-in-life-mvp` into `main`, but do not press merge until the PR resolves the two textual conflicts and agrees on the architecture above.

If the goal is hackathon submission first, merge only the PWA/frontend/docs delivery pieces now. Then create follow-up issues for schema, API client, deterministic search, D1 persistence, ingestion, agents, and tests.
