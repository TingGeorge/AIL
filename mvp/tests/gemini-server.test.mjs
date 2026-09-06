import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGeminiStructuredResponse,
  GeminiRequestError,
  readGeminiConfiguration,
} from '../lib/gemini-core.ts';

const configuration = { apiKey: 'test-secret', model: 'gemini-2.5-pro' };

function structuredResponse(value, options = {}) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15,
      },
    }),
    {
      status: options.status ?? 200,
      headers: { 'x-goog-request-id': options.requestId ?? 'req_test' },
    },
  );
}

function baseOptions(fetchImpl) {
  return {
    configuration,
    instructions: 'Return the schema only.',
    input: { safe: true },
    schemaName: 'test_schema',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: { value: { type: 'string' } },
    },
    validate: (value) =>
      value && typeof value === 'object' && typeof value.value === 'string'
        ? value
        : null,
    fetchImpl,
    createClientRequestId: () => 'client_test',
  };
}

test('reads Gemini key and model only from server environment values', () => {
  assert.deepEqual(
    readGeminiConfiguration({
      GEMINI_API_KEY: ' secret ',
      GEMINI_MODEL: ' gemini-2.5-pro ',
    }),
    { apiKey: 'secret', model: 'gemini-2.5-pro' },
  );
  assert.equal(readGeminiConfiguration({ GEMINI_API_KEY: 'secret' }), null);
  assert.equal(readGeminiConfiguration(null), null);
});

test('sends a Gemini structured-output request without tools', async () => {
  let capturedUrl;
  let capturedInit;
  const result = await createGeminiStructuredResponse(
    baseOptions(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return structuredResponse({ value: 'ok' });
    }),
  );

  assert.equal(
    capturedUrl,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
  );
  assert.equal(capturedInit.headers['x-goog-api-key'], 'test-secret');
  assert.equal(capturedInit.headers['X-Client-Request-Id'], 'client_test');
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.systemInstruction.parts[0].text, 'Return the schema only.');
  assert.equal(body.contents[0].role, 'user');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(body.generationConfig.responseJsonSchema, baseOptions(null).schema);
  assert.equal(body.tools, undefined);
  assert.equal(result.data.value, 'ok');
  assert.equal(result.requestId, 'req_test');
  assert.deepEqual(result.usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 15,
  });
});

test('retries 429 and 5xx at most once, but never retries other 4xx', async () => {
  let calls = 0;
  const retryResult = await createGeminiStructuredResponse({
    ...baseOptions(async () => {
      calls += 1;
      return calls === 1
        ? new Response('', { status: 429 })
        : structuredResponse({ value: 'after retry' });
    }),
    sleep: async () => {},
    random: () => 0,
  });
  assert.equal(calls, 2);
  assert.equal(retryResult.data.value, 'after retry');

  calls = 0;
  await assert.rejects(
    createGeminiStructuredResponse({
      ...baseOptions(async () => {
        calls += 1;
        return new Response('', { status: 401 });
      }),
      sleep: async () => {},
    }),
    (error) =>
      error instanceof GeminiRequestError &&
      error.code === 'AI_REQUEST_REJECTED' &&
      error.status === 401,
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    createGeminiStructuredResponse({
      ...baseOptions(async () => {
        calls += 1;
        return new Response('', { status: 503 });
      }),
      sleep: async () => {},
      random: () => 0,
    }),
    (error) =>
      error instanceof GeminiRequestError &&
      error.code === 'AI_UPSTREAM_ERROR' &&
      error.status === 503,
  );
  assert.equal(calls, 2);
});

test('normalizes timeout and invalid model responses', async () => {
  await assert.rejects(
    createGeminiStructuredResponse({
      ...baseOptions(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ),
      timeoutMs: 10,
    }),
    (error) => error instanceof GeminiRequestError && error.code === 'AI_TIMEOUT',
  );

  await assert.rejects(
    createGeminiStructuredResponse(
      baseOptions(async () => structuredResponse({ notTheExpectedSchema: true })),
    ),
    (error) =>
      error instanceof GeminiRequestError && error.code === 'AI_INVALID_RESPONSE',
  );

  await assert.rejects(
    createGeminiStructuredResponse(
      baseOptions(
        async () =>
          new Response('{not json', {
            status: 200,
            headers: { 'x-goog-request-id': 'req_bad_json' },
          }),
      ),
    ),
    (error) =>
      error instanceof GeminiRequestError &&
      error.code === 'AI_INVALID_RESPONSE' &&
      error.requestId === 'req_bad_json',
  );
});
