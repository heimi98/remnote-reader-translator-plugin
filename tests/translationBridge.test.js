const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BridgeUnavailableError,
  createTranslationBridgeHandler,
  requestTranslationViaTransport,
} = require('../src/lib/translationBridge.ts');

function createFakeTransport() {
  const listeners = new Set();

  return {
    async post(message) {
      queueMicrotask(() => {
        for (const listener of listeners) {
          listener(message);
        }
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

test('returns the bridge result after ack and response', async () => {
  const transport = createFakeTransport();

  createTranslationBridgeHandler(transport, async (request) => ({
    translatedText: `${request.text} translated`,
    provider: request.provider,
    providerLabel: 'AI Translate',
  }));

  const result = await requestTranslationViaTransport(
    transport,
    {
      text: 'hello',
      sourceLanguage: 'en',
      targetLanguage: 'zh-Hans',
      provider: 'ai',
    },
    {
      ackTimeoutMs: 20,
      responseTimeoutMs: 100,
    }
  );

  assert.equal(result.translatedText, 'hello translated');
  assert.equal(result.provider, 'ai');
  assert.equal(result.providerLabel, 'AI Translate');
});

test('fails fast when no bridge handler acknowledges the request', async () => {
  const transport = createFakeTransport();

  await assert.rejects(
    requestTranslationViaTransport(
      transport,
      {
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hans',
        provider: 'ai',
      },
      {
        ackTimeoutMs: 20,
        responseTimeoutMs: 100,
      }
    ),
    BridgeUnavailableError
  );
});

test('surfaces the bridge error message to the caller', async () => {
  const transport = createFakeTransport();

  createTranslationBridgeHandler(transport, async () => {
    throw new Error('bridge translation failed');
  });

  await assert.rejects(
    requestTranslationViaTransport(
      transport,
      {
        text: 'hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hans',
        provider: 'ai',
      },
      {
        ackTimeoutMs: 20,
        responseTimeoutMs: 100,
      }
    ),
    /bridge translation failed/
  );
});
