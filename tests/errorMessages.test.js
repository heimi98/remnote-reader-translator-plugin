const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createTranslationError,
  getErrorMessage,
} = require('../src/lib/http.ts');
const { BridgeUnavailableError } = require('../src/lib/translationBridge.ts');

test('configuration errors include a diagnostic code and next action', () => {
  const error = createTranslationError({
    kind: 'configuration',
    provider: 'ai',
    detail: 'Please fill in AI API Key in plugin settings first.',
  });

  const message = getErrorMessage(error);

  assert.match(message, /RT-CONFIG-MISSING/);
  assert.match(message, /设置|settings/i);
});

test('network errors include a diagnostic code and failure stage', () => {
  const error = createTranslationError({
    kind: 'network',
    provider: 'baidu',
    detail: 'Failed to fetch',
  });

  const message = getErrorMessage(error);

  assert.match(message, /RT-NET-BLOCKED/);
  assert.match(message, /请求还没到达翻译服务|did not reach the translation provider/i);
});

test('service errors include a diagnostic code', () => {
  const error = createTranslationError({
    kind: 'service',
    provider: 'ai',
    status: 429,
    detail: 'Rate limit exceeded',
  });

  const message = getErrorMessage(error);

  assert.match(message, /RT-SERVICE-ERROR/);
  assert.match(message, /429|Rate limit exceeded/);
});

test('bridge unavailable error includes a bridge-specific diagnostic code', () => {
  const message = getErrorMessage(new BridgeUnavailableError());

  assert.match(message, /RT-BRIDGE-NO-ACK/);
  assert.match(message, /桥接|bridge/i);
});
