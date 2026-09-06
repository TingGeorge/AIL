import catalogSnapshot from '../data/yuanshan-open-data.snapshot.json' with { type: 'json' };

export type BuildEnvironment = Readonly<Record<string, unknown>>;

export type CommitSource = 'cloudflare' | 'github' | 'sites' | 'local';

export type BuildInfo = {
  runtime: {
    framework: 'Vinext';
    database: 'D1';
    ai: 'Google Gemini API';
  };
  commit: {
    sha: string;
    source: CommitSource;
  };
  schema: {
    migration: '0009_account_state_revision.sql';
    deploymentMigration: '0008_account_state_revision.sql';
  };
  catalog: {
    artifact: 'data/yuanshan-open-data.snapshot.json';
    importerVersion: string;
    runId: string;
    completedAt: string;
    area: {
      id: string;
      name: string;
      radiusM: number;
      anchor: {
        name: string;
        externalId: string;
        latitude: number;
        longitude: number;
      };
    };
    counts: {
      places: number;
      restaurants: number;
      opportunities: number;
      evidenceAssertions: number;
      sourcesFetched: number;
    };
  };
};

const commitCandidates = [
  { variable: 'CF_PAGES_COMMIT_SHA', source: 'cloudflare' },
  { variable: 'GITHUB_SHA', source: 'github' },
  { variable: 'SITES_COMMIT_SHA', source: 'sites' },
  { variable: 'OPENAI_SITE_COMMIT_SHA', source: 'sites' },
  { variable: 'OPENAI_SITES_COMMIT_SHA', source: 'sites' },
] as const satisfies ReadonlyArray<{
  variable: string;
  source: Exclude<CommitSource, 'local'>;
}>;

const commitShaPattern = /^[0-9a-f]{7,64}$/i;

function resolveCommit(environments: readonly BuildEnvironment[]) {
  for (const candidate of commitCandidates) {
    for (const environment of environments) {
      const value = environment[candidate.variable];
      if (typeof value !== 'string') continue;
      const sha = value.trim();
      if (commitShaPattern.test(sha)) {
        return { sha: sha.toLowerCase(), source: candidate.source };
      }
    }
  }
  return { sha: 'local', source: 'local' } as const;
}

const catalogMetadata = {
  artifact: 'data/yuanshan-open-data.snapshot.json',
  importerVersion: catalogSnapshot.meta.importerVersion,
  runId: catalogSnapshot.meta.runId,
  completedAt: catalogSnapshot.meta.completedAt,
  area: {
    id: catalogSnapshot.meta.area.id,
    name: catalogSnapshot.meta.area.name,
    radiusM: catalogSnapshot.meta.area.radiusM,
    anchor: {
      name: catalogSnapshot.meta.area.anchor.name,
      externalId: catalogSnapshot.meta.area.anchor.externalId,
      latitude: catalogSnapshot.meta.area.anchor.latitude,
      longitude: catalogSnapshot.meta.area.anchor.longitude,
    },
  },
  counts: {
    places: catalogSnapshot.meta.counts.places,
    restaurants: catalogSnapshot.meta.counts.restaurants,
    opportunities: catalogSnapshot.meta.counts.opportunities,
    evidenceAssertions: catalogSnapshot.meta.counts.evidenceAssertions,
    sourcesFetched: catalogSnapshot.meta.counts.sourcesFetched,
  },
} as const satisfies BuildInfo['catalog'];

export function createBuildInfo(
  environment: BuildEnvironment = process.env,
  ...fallbackEnvironments: readonly BuildEnvironment[]
): BuildInfo {
  return {
    runtime: {
      framework: 'Vinext',
      database: 'D1',
      ai: 'Google Gemini API',
    },
    commit: resolveCommit([environment, ...fallbackEnvironments]),
    schema: {
      migration: '0009_account_state_revision.sql',
      deploymentMigration: '0008_account_state_revision.sql',
    },
    catalog: catalogMetadata,
  };
}
