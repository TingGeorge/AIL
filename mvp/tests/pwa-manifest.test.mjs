import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, '..');
const darkThemeColor = '#090c0a';

test('PWA manifests use the same dark launch color as the default theme', () => {
  const publicManifest = JSON.parse(
    readFileSync(
      path.join(projectDirectory, 'public', 'manifest.webmanifest'),
      'utf8',
    ),
  );
  assert.equal(publicManifest.background_color, darkThemeColor);
  assert.equal(publicManifest.theme_color, darkThemeColor);

  const appManifest = readFileSync(
    path.join(projectDirectory, 'app', 'manifest.ts'),
    'utf8',
  );
  assert.match(appManifest, /background_color:\s*'#090c0a'/u);
  assert.match(appManifest, /theme_color:\s*'#090c0a'/u);
});
