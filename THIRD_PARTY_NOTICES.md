# Third-party notices

This file records the direct third-party software, AI service, database, and
research-source dependencies used by ALL IN LIFE. The project does not claim
that upstream public websites or their data have a blanket open-data license;
each source remains subject to its own terms.

## AI service

- **Google Gemini API** — Used through the native Interactions API from
  `prototype-v1/src/server/gemini.ts` for structured requirement parsing,
  voice transcription, and recommendation ranking.
- The API key is read only from the server-side `GEMINI_API_KEY` environment
  variable. The model is selected by the server-side `GEMINI_MODEL` variable;
  model weights are not bundled in this repository.
- Official terms: [Gemini API Additional Terms of
  Service](https://ai.google.dev/gemini-api/terms). Google’s terms page also
  requires acceptance of the applicable Google APIs Terms of Service.

## Direct software dependencies

The versions are declared in `prototype-v1/package.json` and
`prototype-v1/bun.lock`. Transitive dependencies remain governed by
their own package licenses in the lockfile and installed package
distributions.

| Package | Use | License |
| --- | --- | --- |
| `busboy` | Multipart audio upload parsing | MIT |
| `hono` | HTTP server and API routes | MIT |
| `lucide-react` | UI icons | ISC |
| `react` / `react-dom` | Web UI | MIT |
| `zod` | Runtime schema validation | MIT |
| `@types/bun` | Bun types | MIT |
| `@types/busboy` | Busboy types | MIT |
| `@types/react` / `@types/react-dom` | React types | MIT |
| `@vitejs/plugin-react` | Vite React integration | MIT |
| `vite` | Frontend development and build | MIT |
| `typescript` | Type checking and compilation | Apache-2.0 |

The application also requires:

- **Bun runtime** — MIT; see the
  [official Bun license](https://bun.com/docs/project/license).
- **PostgreSQL** — PostgreSQL License; see the
  [official PostgreSQL license](https://www.postgresql.org/about/licence/).

Their licenses and service terms are not replaced by the application’s MIT
license.

## Documentation tooling

- **Archify 2.17** — MIT-licensed development tool used to generate the
  self-contained interactive architecture and product-flow HTML files under
  `docs/architecture/`. It is not part of the application runtime.

## Research data and source material

The application uses a dated, curated research snapshot rather than live web
search:

- Research method, coverage, limitations, and source policy:
  `docs/research/README.md`
- Category research and source URLs:
  `docs/research/*-sources.md`
- Imported records and per-record provenance:
  `prototype-v1/data/live/*.json`

The records retain official provider URLs and evidence excerpts. Provider
terms vary; the project does not relicense those websites’ content as MIT.
Before redistributing a source excerpt or expanding the dataset, check the
relevant provider’s current terms.

## Project license boundary

The ALL IN LIFE source code is released under the
[MIT License](LICENSE). That license applies to this repository’s project
code; it does not grant rights to Google services, upstream provider data, or
other third-party material.

The AILI mascot, PWA icons, CSS compass, and interface motion are project-made
assets implemented or stored in this repository; no third-party image, font,
video, or music asset is bundled for them. Any external media added for the
final evaluation video must be recorded here before submission.
