# ALL in life

Bun + Hono + React (Vite) + Vercel AI SDK. Single package.

- Read `CONTEXT.md` for vocabulary before naming anything. `docs/SPEC-voice-input.md` is the build contract for voice input; `docs/PRD-all-in-life.md` is product scope; `docs/SPEC-backend.md` is the backend contract (schema, API, search pipeline); `docs/SPEC-geocoding.md` is the location-data contract (addresses, coordinates, geolocation); `docs/SPEC-ingestion.md` is the data-ingestion contract (what to collect, field-by-field nullability, import scripts).
- Code lives in `prototype-v1/` (current build) and `old_version/` (previous build). `src/shared/need.ts` is the one 需求與限制 schema for server and client.
- Commands: `bun run dev`, `bun run typecheck`, `bun test`, `bun run build`.
- Providers are OpenAI-compatible via env vars in `.env.example`; never hardcode a vendor.
