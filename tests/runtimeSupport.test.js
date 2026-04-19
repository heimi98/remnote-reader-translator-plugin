const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDefaultProviderForCurrentRuntime,
  isProviderSupportedInCurrentRuntime,
} = require('../src/lib/runtime.ts');
const { normalizeConfiguredProvider } = require('../src/lib/settings.ts');

function withMockWindow(mockWindow, run) {
  const previousWindow = global.window;

  global.window = mockWindow;

  try {
    run();
  } finally {
    if (typeof previousWindow === 'undefined') {
      delete global.window;
    } else {
      global.window = previousWindow;
    }
  }
}

test('defaults to AI and blocks Baidu in official sandbox runtime', () => {
  withMockWindow(
    {
      location: { hostname: 'plugins.remnote.com' },
      self: { name: 'sandbox-self' },
      top: { name: 'remnote-top' },
    },
    () => {
      assert.equal(getDefaultProviderForCurrentRuntime(), 'ai');
      assert.equal(isProviderSupportedInCurrentRuntime('baidu'), false);
      assert.equal(isProviderSupportedInCurrentRuntime('tencent'), false);
      assert.equal(isProviderSupportedInCurrentRuntime('ai'), true);
    }
  );
});

test('still defaults to AI and blocks Baidu during localhost development', () => {
  withMockWindow(
    {
      location: { hostname: 'localhost' },
      self: { name: 'sandbox-self' },
      top: { name: 'remnote-top' },
    },
    () => {
      assert.equal(getDefaultProviderForCurrentRuntime(), 'ai');
      assert.equal(isProviderSupportedInCurrentRuntime('baidu'), false);
      assert.equal(isProviderSupportedInCurrentRuntime('tencent'), false);
      assert.equal(isProviderSupportedInCurrentRuntime('ai'), true);
    }
  );
});

test('legacy provider settings normalize back to AI', () => {
  assert.equal(normalizeConfiguredProvider('baidu'), 'ai');
  assert.equal(normalizeConfiguredProvider('tencent'), 'ai');
  assert.equal(normalizeConfiguredProvider('ai'), 'ai');
  assert.equal(normalizeConfiguredProvider(undefined), 'ai');
});
