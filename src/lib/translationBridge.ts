import type { RNPlugin } from '@remnote/plugin-sdk';

import { getErrorMessage } from './http';
import { loadRuntimeSettings } from './settings';
import { translateSelectionText } from './translation';
import type { TranslationRequest, TranslationResult, TranslationRuntimeSettings } from './types';

const REQUEST_TYPE = 'reader-translator:translation-request';
const ACK_TYPE = 'reader-translator:translation-ack';
const RESPONSE_TYPE = 'reader-translator:translation-response';
const MESSAGE_BROADCAST_EVENT = 'messaging.broadcast';

const DEFAULT_ACK_TIMEOUT_MS = 300;
const DEFAULT_RESPONSE_TIMEOUT_MS = 25_000;

interface BridgeRequestMessage {
  type: typeof REQUEST_TYPE;
  requestId: string;
  request: TranslationRequest;
}

interface BridgeAckMessage {
  type: typeof ACK_TYPE;
  requestId: string;
}

interface BridgeSuccessResponseMessage {
  type: typeof RESPONSE_TYPE;
  requestId: string;
  ok: true;
  result: TranslationResult;
}

interface BridgeErrorResponseMessage {
  type: typeof RESPONSE_TYPE;
  requestId: string;
  ok: false;
  errorMessage: string;
}

type BridgeMessage =
  | BridgeRequestMessage
  | BridgeAckMessage
  | BridgeSuccessResponseMessage
  | BridgeErrorResponseMessage;

export interface TranslationBridgeTransport {
  post(message: BridgeMessage): Promise<void>;
  subscribe(listener: (message: unknown) => void): () => void;
}

interface RequestTranslationOptions {
  ackTimeoutMs?: number;
  responseTimeoutMs?: number;
}

export class BridgeUnavailableError extends Error {
  constructor(message = 'Translation bridge is unavailable.') {
    super(message);
    this.name = 'BridgeUnavailableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTranslationRequest(value: unknown): value is TranslationRequest {
  return (
    isObject(value) &&
    typeof value.text === 'string' &&
    typeof value.sourceLanguage === 'string' &&
    typeof value.targetLanguage === 'string' &&
    typeof value.provider === 'string'
  );
}

function isBridgeMessage(value: unknown): value is BridgeMessage {
  if (!isObject(value) || typeof value.type !== 'string' || typeof value.requestId !== 'string') {
    return false;
  }

  if (value.type === REQUEST_TYPE) {
    return isTranslationRequest(value.request);
  }

  if (value.type === ACK_TYPE) {
    return true;
  }

  if (value.type === RESPONSE_TYPE) {
    return (
      (value.ok === true && isObject(value.result) && typeof value.result.translatedText === 'string') ||
      (value.ok === false && typeof value.errorMessage === 'string')
    );
  }

  return false;
}

function createRequestId(): string {
  return `translation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPluginBridgeTransport(plugin: RNPlugin): TranslationBridgeTransport {
  return {
    async post(message) {
      await plugin.messaging.broadcast(message);
    },
    subscribe(listener) {
      plugin.event.addListener(MESSAGE_BROADCAST_EVENT, undefined, listener);
      return () => {
        plugin.event.removeListener(MESSAGE_BROADCAST_EVENT, undefined, listener);
      };
    },
  };
}

export async function requestTranslationViaTransport(
  transport: TranslationBridgeTransport,
  request: TranslationRequest,
  options: RequestTranslationOptions = {}
): Promise<TranslationResult> {
  const requestId = createRequestId();
  const ackTimeoutMs = options.ackTimeoutMs ?? DEFAULT_ACK_TIMEOUT_MS;
  const responseTimeoutMs = options.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;

  return await new Promise<TranslationResult>((resolve, reject) => {
    let settled = false;

    const cleanup = (unsubscribe: () => void, ackTimer: ReturnType<typeof setTimeout>, responseTimer: ReturnType<typeof setTimeout>) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(ackTimer);
      clearTimeout(responseTimer);
      unsubscribe();
    };

    const unsubscribe = transport.subscribe((message) => {
      if (!isBridgeMessage(message) || message.requestId !== requestId) {
        return;
      }

      if (message.type === ACK_TYPE) {
        clearTimeout(ackTimer);
        return;
      }

      if (message.type === RESPONSE_TYPE) {
        cleanup(unsubscribe, ackTimer, responseTimer);

        if (message.ok) {
          resolve(message.result);
        } else {
          reject(new Error(message.errorMessage));
        }
      }
    });

    const ackTimer = setTimeout(() => {
      cleanup(unsubscribe, ackTimer, responseTimer);
      reject(new BridgeUnavailableError());
    }, ackTimeoutMs);

    const responseTimer = setTimeout(() => {
      cleanup(unsubscribe, ackTimer, responseTimer);
      reject(new Error('Translation bridge timed out.'));
    }, responseTimeoutMs);

    void transport
      .post({
        type: REQUEST_TYPE,
        requestId,
        request,
      })
      .catch((error) => {
        cleanup(unsubscribe, ackTimer, responseTimer);
        reject(
          error instanceof BridgeUnavailableError
            ? error
            : new BridgeUnavailableError(getErrorMessage(error, 'Failed to send translation request.'))
        );
      });
  });
}

export function createTranslationBridgeHandler(
  transport: TranslationBridgeTransport,
  handleRequest: (request: TranslationRequest) => Promise<TranslationResult>
): () => void {
  return transport.subscribe((message) => {
    if (!isBridgeMessage(message) || message.type !== REQUEST_TYPE) {
      return;
    }

    void transport.post({
      type: ACK_TYPE,
      requestId: message.requestId,
    });

    void handleRequest(message.request)
      .then(async (result) => {
        await transport.post({
          type: RESPONSE_TYPE,
          requestId: message.requestId,
          ok: true,
          result,
        });
      })
      .catch(async (error) => {
        await transport.post({
          type: RESPONSE_TYPE,
          requestId: message.requestId,
          ok: false,
          errorMessage: getErrorMessage(error),
        });
      });
  });
}

export function registerPluginTranslationBridge(plugin: RNPlugin): () => void {
  const transport = createPluginBridgeTransport(plugin);

  return createTranslationBridgeHandler(transport, async (request) => {
    const settings = await loadRuntimeSettings(plugin);
    return await translateSelectionText(settings, request);
  });
}

export async function translateSelectionTextWithBridge(
  plugin: RNPlugin,
  settings: TranslationRuntimeSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  try {
    return await requestTranslationViaTransport(createPluginBridgeTransport(plugin), request);
  } catch (error) {
    if (!(error instanceof BridgeUnavailableError)) {
      throw error;
    }

    return await translateSelectionText(settings, request);
  }
}
