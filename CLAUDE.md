# ALL in life

Bun + Hono + React (Vite) + Vercel AI SDK. Single package.

- Read `CONTEXT.md` for vocabulary before naming anything. `docs/SPEC-voice-input.md` is the build contract for voice input; `docs/PRD-all-in-life.md` is product scope.
- `src/shared/need.ts` is the one 需求與限制 schema for server and client.
- Commands: `bun run dev`, `bun run typecheck`, `bun test`, `bun run build`.
- Providers are OpenAI-compatible via env vars in `.env.example`; never hardcode a vendor.
