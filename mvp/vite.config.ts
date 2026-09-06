import { sites } from '@openai/sites-vite-plugin';
import tailwindcss from '@tailwindcss/postcss';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import hostingConfig from './.openai/hosting.json';

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  '00000000-0000-4000-8000-000000000000';

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

function sitesDeploymentMigrations() {
  return {
    name: 'all-in-life-sites-deployment-migrations',
    apply: 'build' as const,
    enforce: 'post' as const,
    closeBundle: {
      order: 'post' as const,
      sequential: true,
      async handler() {
        const target = resolve('dist', '.openai', 'drizzle');
        await rm(target, { recursive: true, force: true });
        await mkdir(target, { recursive: true });
        for (const [source, destination] of [
          ['drizzle/0001_p0_core.sql', '0001_p0_core.sql'],
          ['drizzle/0002_product_flow.sql', '0002_product_flow.sql'],
          ['drizzle/0003_open_data_ingestion.sql', '0003_open_data_ingestion.sql'],
          ['sites-drizzle/0004_catalog_seed.sql', '0004_catalog_seed.sql'],
          ['drizzle/0006_ai_rate_limits.sql', '0005_ai_rate_limits.sql'],
        ] as const) {
          await cp(resolve(source), resolve(target, destination));
        }
      },
    },
  };
}

const localBindingConfig = {
  main: 'vinext/server/fetch-handler',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: 'site-creator-d1',
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: 'site-creator-r2',
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      // Vite 8 enables console forwarding automatically inside coding-agent
      // environments. If HMR reconnects, its forwarding transport can call
      // send() before the websocket exists and recursively flood the overlay.
      // Normal browser console output and Vite's compile-error overlay remain.
      forwardConsole: false,
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      sitesDeploymentMigrations(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
