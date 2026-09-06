import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountSaveQueue } from '../lib/account-save-queue.ts';

test('account save queue serializes revisions while a prior request is pending', async () => {
  const queue = createAccountSaveQueue();
  let releaseFirst;
  const firstMayFinish = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let firstStarted;
  const firstDidStart = new Promise((resolve) => {
    firstStarted = resolve;
  });
  let revision = 0;
  let activeRequests = 0;
  let maximumActiveRequests = 0;

  const save = async (nextValue, waitForRelease = false) => {
    const expectedRevision = revision;
    activeRequests += 1;
    maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
    if (waitForRelease) {
      firstStarted();
      await firstMayFinish;
    }
    revision = expectedRevision + 1;
    activeRequests -= 1;
    return { nextValue, revision };
  };

  const first = queue.enqueue(() => save('first', true));
  await firstDidStart;
  const second = queue.enqueue(() => save('second'));

  await Promise.resolve();
  assert.equal(activeRequests, 1);
  assert.equal(revision, 0);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), [
    { nextValue: 'first', revision: 1 },
    { nextValue: 'second', revision: 2 },
  ]);
  assert.equal(maximumActiveRequests, 1);
});

test('account save queue continues after a rejected request', async () => {
  const queue = createAccountSaveQueue();
  const expectedError = new Error('network unavailable');

  await assert.rejects(
    queue.enqueue(async () => {
      throw expectedError;
    }),
    expectedError,
  );
  await assert.doesNotReject(queue.enqueue(async () => 'recovered'));
});
