# ALL IN LIFE

Bun + Hono + React + Vite + PostgreSQL single-package Web App. The only active application is `prototype-v1/`.

- Read `CONTEXT.md` before introducing domain terminology.
- Product and engineering documents live under `docs/`; some SPEC files still contain historical state and must be checked against the current code before implementation.
- Client, server, shared code, scripts, tests, data, package files, and the effective `.env.example` all live under `prototype-v1/`.
- Run application commands from `prototype-v1/`: `bun run dev`, `bun run typecheck`, `bun test`, `bun run build`, and `bun run data:validate`.
- AI features use the native Google Gemini Interactions API through server-only `GEMINI_API_KEY` and `GEMINI_MODEL` variables. Never hardcode credentials or expose them with `VITE_` prefixes.
- `main-copy` preserves the pre-cleanup snapshot at commit `6be730d`; do not restore legacy runtimes into `main` without an explicit migration decision.
