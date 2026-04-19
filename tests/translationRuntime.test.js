const test = require('node:test');
const assert = require('node:assert/strict');

const { getErrorMessage } = require('../src/lib/http.ts');
const { translateSelectionText } = require('../src/lib/translation.ts');

function withMockWindow(mockWindow, run) {
  const previousWindow = global.window;

  global.window = mockWindow;

  try {
    return run();
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
}

test('does not call fetch when a legacy Baidu provider is selected', async () => {
  await withMockWindow(
    {
      location: { hostname: 'plugins.remnote.com' },
      self: { name: 'sandbox-self' },
      top: { name: 'remnote-top' },
    },
    async () => {
      const settings = {
        provider: 'baidu',
        sourceLanguage: 'en',
        targetLanguage: 'zh-Hans',
        baiduAppId: 'app-id',
        baiduSecretKey: 'secret',
        tencentSecretId: '',
        tencentSecretKey: '',
        aiBaseUrl: 'https://api.openai.com/v1',
        aiApiKey: '',
        aiModel: '',
        aiPromptTemplate: 'Translate {{text}}',
      };

      const previousFetch = global.fetch;
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        throw new Error('fetch should not be called');
      };

      try {
        await assert.rejects(
          translateSelectionText(settings, {
            text: 'hello',
            sourceLanguage: 'en',
            targetLanguage: 'zh-Hans',
            provider: 'baidu',
          }),
          (error) => /RT-RUNTIME-UNSUPPORTED/.test(getErrorMessage(error))
        );
        assert.equal(fetchCalled, false);
      } finally {
        global.fetch = previousFetch;
      }
    }
  );
});
