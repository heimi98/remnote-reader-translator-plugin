import { getProviderLabel } from './constants';
import { createTranslationError } from './http';
import { pickLocalized } from './i18n';
import {
  getUnsupportedProviderRuntimeDetail,
  isProviderSupportedInCurrentRuntime,
} from './runtime';
import type {
  ReaderSelectionLike,
  TranslationRequest,
  TranslationResult,
  TranslationRuntimeSettings,
} from './types';
import { translateWithOpenAICompatible } from './providers/openaiCompatible';

const pendingTranslations = new Map<string, Promise<TranslationResult>>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function tryReadSelection(candidate: unknown): ReaderSelectionLike | null {
  if (!isObject(candidate)) {
    return null;
  }

  if (typeof candidate.text !== 'string' || typeof candidate.type !== 'string') {
    return null;
  }

  return {
    text: candidate.text,
    type: candidate.type,
    remId: typeof candidate.remId === 'string' ? candidate.remId : undefined,
  };
}

export function extractReaderSelection(payload: unknown): ReaderSelectionLike | null {
  const root = isObject(payload) ? payload : {};
  const candidates = [
    payload,
    root.selection,
    root.readerSelection,
    root.contextData,
    root.context,
    isObject(root.context) ? root.context.selection : undefined,
  ];

  for (const candidate of candidates) {
    const selection = tryReadSelection(candidate);
    if (selection) {
      return selection;
    }
  }

  return null;
}

function buildPendingKey(request: TranslationRequest): string {
  return JSON.stringify([request.provider, request.sourceLanguage, request.targetLanguage, request.text]);
}

async function runTranslation(
  settings: TranslationRuntimeSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  if (!isProviderSupportedInCurrentRuntime(request.provider)) {
    throw createTranslationError({
      kind: 'runtime',
      provider: request.provider,
      detail: getUnsupportedProviderRuntimeDetail(request.provider),
    });
  }

  switch (request.provider) {
    case 'ai':
      return translateWithOpenAICompatible(settings, request);
    default:
      throw createTranslationError({
        kind: 'runtime',
        provider: request.provider,
        detail: getUnsupportedProviderRuntimeDetail(request.provider),
      });
  }
}

export async function testTranslationProviderConnectivity(
  settings: TranslationRuntimeSettings
): Promise<TranslationResult> {
  const request: TranslationRequest = {
    text: 'Hello from the RemNote translator plugin connectivity test.',
    sourceLanguage: 'en',
    targetLanguage: 'zh-Hans',
    provider: settings.provider,
  };

  return runTranslation(settings, request);
}

export async function translateSelectionText(
  settings: TranslationRuntimeSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);
  const text = request.text.trim();

  if (!text) {
    throw new Error(t('未找到可翻译的文本。', 'No translatable text was found.'));
  }

  if (request.sourceLanguage === request.targetLanguage && request.sourceLanguage !== 'auto') {
    return {
      translatedText: text,
      detectedSourceLanguage: request.sourceLanguage,
      provider: request.provider,
      providerLabel: getProviderLabel(request.provider),
    };
  }

  const normalizedRequest = { ...request, text };
  const pendingKey = buildPendingKey(normalizedRequest);
  const existing = pendingTranslations.get(pendingKey);

  if (existing) {
    return existing;
  }

  const translationPromise = runTranslation(settings, normalizedRequest).finally(() => {
    pendingTranslations.delete(pendingKey);
  });

  pendingTranslations.set(pendingKey, translationPromise);
  return translationPromise;
}
