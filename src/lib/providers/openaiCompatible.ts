import { DEFAULT_AI_BASE_URL, DEFAULT_AI_PROMPT_TEMPLATE, getProviderLabel } from '../constants';
import {
  createTranslationError,
  fetchJson,
  resolveRuntimeFetchUrl,
  rethrowWithTranslationErrorProvider,
} from '../http';
import { pickLocalized } from '../i18n';
import { getAiLanguageLabel } from '../languages';
import type { TranslationRequest, TranslationResult, TranslationRuntimeSettings } from '../types';

interface ChatCompletionsResponse {
  error?: {
    message?: string;
  };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

function resolveCompletionsUrl(baseUrl: string): string {
  const normalized = (baseUrl || DEFAULT_AI_BASE_URL).replace(/\/+$/, '');

  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function renderPrompt(template: string, request: TranslationRequest): string {
  const sourceLanguage = getAiLanguageLabel(request.sourceLanguage);
  const targetLanguage = getAiLanguageLabel(request.targetLanguage);

  return (template || DEFAULT_AI_PROMPT_TEMPLATE)
    .replaceAll('{{sourceLanguage}}', sourceLanguage)
    .replaceAll('{{targetLanguage}}', targetLanguage)
    .replaceAll('{{text}}', request.text);
}

function extractMessageContent(content: ChatCompletionsResponse['choices']): string {
  const messageContent = content?.[0]?.message?.content;

  if (typeof messageContent === 'string') {
    return messageContent.trim();
  }

  if (Array.isArray(messageContent)) {
    return messageContent
      .map((item) => item.text ?? '')
      .join('')
      .trim();
  }

  return '';
}

function isAiCredentialError(status?: number, detail?: string): boolean {
  if (status === 401 || status === 403) {
    return true;
  }

  const normalizedDetail = detail?.toLowerCase() ?? '';

  return (
    normalizedDetail.includes('invalid_api_key') ||
    normalizedDetail.includes('incorrect api key') ||
    normalizedDetail.includes('unauthorized') ||
    normalizedDetail.includes('invalid authentication') ||
    normalizedDetail.includes('invalid token') ||
    normalizedDetail.includes('api key')
  );
}

export async function translateWithOpenAICompatible(
  settings: TranslationRuntimeSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  if (!settings.aiApiKey) {
    throw createTranslationError({
      kind: 'configuration',
      provider: 'ai',
      detail: t('请先在插件设置中填写 AI API Key。', 'Please fill in AI API Key in plugin settings first.'),
    });
  }

  if (!settings.aiModel) {
    throw createTranslationError({
      kind: 'configuration',
      provider: 'ai',
      detail: t('请先在插件设置中填写 AI Model。', 'Please fill in AI Model in plugin settings first.'),
    });
  }

  const prompt = renderPrompt(settings.aiPromptTemplate, request);
  const endpoint = resolveCompletionsUrl(settings.aiBaseUrl);

  let response: Response;
  let data: ChatCompletionsResponse | undefined;
  let text = '';

  try {
    ({ response, data, text } = await fetchJson<ChatCompletionsResponse>(
      resolveRuntimeFetchUrl(endpoint),
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.aiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: settings.aiModel,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: 'You are a translation engine. Return only the translated text.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      }
    ));
  } catch (error) {
    rethrowWithTranslationErrorProvider(error, 'ai');
  }

  if (!response.ok) {
    const detail = data?.error?.message?.trim() || text.trim() || `HTTP ${response.status}`;

    throw createTranslationError({
      kind: isAiCredentialError(response.status, detail) ? 'credential' : 'service',
      provider: 'ai',
      status: response.status,
      detail,
    });
  }

  const translatedText = extractMessageContent(data?.choices);

  if (!translatedText) {
    throw createTranslationError({
      kind: 'service',
      provider: 'ai',
      status: response.status,
      detail: t('AI 翻译未返回译文。', 'AI translation returned an empty result.'),
    });
  }

  return {
    translatedText,
    detectedSourceLanguage: request.sourceLanguage === 'auto' ? undefined : request.sourceLanguage,
    provider: 'ai',
    providerLabel: getProviderLabel('ai'),
  };
}
