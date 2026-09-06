import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOpenAIStructuredResponse,
  OpenAIRequestError,
  readOpenAIConfiguration,
} from '../lib/openai-core.ts';

const configuration = { apiKey: 'test-secret', model: 'test-model' };

function structuredResponse(value, options = {}) {
  return new Response(
    JSON.stringify({
      output_text: '{"ignored":true}',
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }),
    {
      status: options.status ?? 200,
      headers: { 'x-request-id': options.requestId ?? 'req_test' },
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

test('reads key and model only from server environment values', () => {
  assert.deepEqual(
    readOpenAIConfiguration({
      OPENAI_API_KEY: ' secret ',
      OPENAI_MODEL: ' model ',
    }),
    { apiKey: 'secret', model: 'model' },
  );
  assert.equal(readOpenAIConfiguration({ OPENAI_API_KEY: 'secret' }), null);
  assert.equal(readOpenAIConfiguration(null), null);
});

test('sends a stateless strict-schema Responses API request with tools disabled', async () => {
  let capturedUrl;
  let capturedInit;
  const result = await createOpenAIStructuredResponse(
    baseOptions(async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return structuredResponse({ value: 'ok' });
    }),
  );

  assert.equal(capturedUrl, 'https://api.openai.com/v1/responses');
  assert.equal(capturedInit.headers.Authorization, 'Bearer test-secret');
  assert.equal(capturedInit.headers['X-Client-Request-Id'], 'client_test');
  const body = JSON.parse(capturedInit.body);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.tools, []);
  assert.equal(body.tool_choice, 'none');
  assert.equal(body.reasoning.effort, 'low');
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
  const retryResult = await createOpenAIStructuredResponse({
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
    createOpenAIStructuredResponse({
      ...baseOptions(async () => {
        calls += 1;
        return new Response('', { status: 401 });
      }),
      sleep: async () => {},
    }),
    (error) =>
      error instanceof OpenAIRequestError &&
      error.code === 'AI_REQUEST_REJECTED' &&
      error.status === 401,
  );
  assert.equal(calls, 1);

  calls = 0;
  await assert.rejects(
    createOpenAIStructuredResponse({
      ...baseOptions(async () => {
        calls += 1;
        return new Response('', { status: 503 });
      }),
      sleep: async () => {},
      random: () => 0,
    }),
    (error) =>
      error instanceof OpenAIRequestError &&
      error.code === 'AI_UPSTREAM_ERROR' &&
      error.status === 503,
  );
  assert.equal(calls, 2);
});

test('normalizes timeout, malformed JSON, and schema failure without leaking bodies', async () => {
  await assert.rejects(
    createOpenAIStructuredResponse({
      ...baseOptions(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new Error('aborted')),
            );
          }),
      ),
      timeoutMs: 10,
    }),
    (error) =>
      error instanceof OpenAIRequestError && error.code === 'AI_TIMEOUT',
  );

  await assert.rejects(
    createOpenAIStructuredResponse(
      baseOptions(async () =>
        structuredResponse({ notTheExpectedSchema: true }),
      ),
    ),
    (error) =>
      error instanceof OpenAIRequestError &&
      error.code === 'AI_INVALID_RESPONSE',
  );

  await assert.rejects(
    createOpenAIStructuredResponse(
      baseOptions(
        async () =>
          new Response('{not json', {
            status: 200,
            headers: { 'x-request-id': 'req_bad_json' },
          }),
      ),
    ),
    (error) =>
      error instanceof OpenAIRequestError &&
      error.code === 'AI_INVALID_RESPONSE' &&
      error.requestId === 'req_bad_json',
  );
});
