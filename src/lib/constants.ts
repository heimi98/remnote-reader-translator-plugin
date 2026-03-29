import type { TranslationProvider } from './types';
import { pickLocalized } from './i18n';

export const POPUP_WIDGET_NAME = 'translation_popup';
export const SELECTION_BUTTON_WIDGET_NAME = 'selection_translate_button';

// The published RemNote docs expose these widget locations, but the npm SDK typings lag behind.
// We cast them when registering widgets so the plugin can still target the runtime locations.
export const PDF_HIGHLIGHT_WIDGET_LOCATION = 'PDFHighlightToolbarLocation';
export const PDF_HIGHLIGHT_POPUP_LOCATION = 'PDFHighlightPopupLocation';

export const MENU_ITEM_IDS = {
  reader: 'reader-translator-reader-menu',
  pdf: 'reader-translator-pdf-menu',
} as const;

export const SETTING_IDS = {
  provider: 'provider',
  sourceLanguage: 'source-language',
  targetLanguage: 'target-language',
  translateShortcut: 'translate-shortcut',
  testConnectionTrigger: 'test-connection-trigger',
  baiduAppId: 'baidu-app-id',
  baiduSecretKey: 'baidu-secret-key',
  tencentSecretId: 'tencent-secret-id',
  tencentSecretKey: 'tencent-secret-key',
  aiBaseUrl: 'ai-base-url',
  aiApiKey: 'ai-api-key',
  aiModel: 'ai-model',
  aiPromptTemplate: 'ai-prompt-template',
} as const;

export const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_TRANSLATE_SHORTCUT = 'mod+shift+t';
export const DEFAULT_AI_PROMPT_TEMPLATE =
  'Translate the following text from {{sourceLanguage}} to {{targetLanguage}}. Return only the translated text and preserve line breaks.\n\n{{text}}';

export const TENCENT_DEFAULT_REGION = 'ap-beijing';

const PROVIDER_LABELS: Record<TranslationProvider, { zhHans: string; en: string }> = {
  baidu: {
    zhHans: '百度翻译',
    en: 'Baidu Translate',
  },
  tencent: {
    zhHans: '腾讯翻译',
    en: 'Tencent Translate',
  },
  ai: {
    zhHans: 'AI 翻译',
    en: 'AI Translate',
  },
};

export function getProviderLabel(provider: TranslationProvider): string {
  const labels = PROVIDER_LABELS[provider];
  return pickLocalized(labels.zhHans, labels.en);
}
