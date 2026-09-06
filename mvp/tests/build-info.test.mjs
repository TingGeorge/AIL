import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBuildInfo } from '../lib/build-info.ts';

const snapshot = JSON.parse(
  readFileSync(
    new URL('../data/yuanshan-open-data.snapshot.json', import.meta.url),
    'utf8',
  ),
);

test('build metadata uses local fallback and repository snapshot provenance', () => {
  const info = createBuildInfo({});

  assert.deepEqual(info.runtime, {
    framework: 'Vinext',
    database: 'D1',
    ai: 'Google Gemini API',
  });
  assert.deepEqual(info.commit, { sha: 'local', source: 'local' });
  assert.deepEqual(info.schema, {
    migration: '0009_account_state_revision.sql',
    deploymentMigration: '0008_account_state_revision.sql',
  });
  assert.equal(info.catalog.artifact, 'data/yuanshan-open-data.snapshot.json');
  assert.equal(info.catalog.importerVersion, snapshot.meta.importerVersion);
  assert.equal(info.catalog.runId, snapshot.meta.runId);
  assert.equal(info.catalog.completedAt, snapshot.meta.completedAt);
  assert.deepEqual(info.catalog.area, snapshot.meta.area);
  assert.deepEqual(info.catalog.counts, snapshot.meta.counts);
});

test('build metadata selects commits from supported deployment environments', () => {
  const cloudflareSha = 'a'.repeat(40);
  const githubSha = 'B'.repeat(40);
  const sitesSha = 'c'.repeat(40);

  assert.deepEqual(
    createBuildInfo({ CF_PAGES_COMMIT_SHA: ` ${cloudflareSha} ` }).commit,
    { sha: cloudflareSha, source: 'cloudflare' },
  );
  assert.deepEqual(createBuildInfo({ GITHUB_SHA: githubSha }).commit, {
    sha: githubSha.toLowerCase(),
    source: 'github',
  });
  assert.deepEqual(createBuildInfo({ SITES_COMMIT_SHA: sitesSha }).commit, {
    sha: sitesSha,
    source: 'sites',
  });
  assert.deepEqual(
    createBuildInfo({ OPENAI_SITE_COMMIT_SHA: sitesSha }).commit,
    { sha: sitesSha, source: 'sites' },
  );
  assert.deepEqual(
    createBuildInfo({ OPENAI_SITES_COMMIT_SHA: sitesSha }).commit,
    { sha: sitesSha, source: 'sites' },
  );

  assert.deepEqual(
    createBuildInfo(
      { GITHUB_SHA: githubSha, SITES_COMMIT_SHA: sitesSha },
      { CF_PAGES_COMMIT_SHA: cloudflareSha },
    ).commit,
    { sha: cloudflareSha, source: 'cloudflare' },
  );
});
