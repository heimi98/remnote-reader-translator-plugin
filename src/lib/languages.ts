import type { TranslationProvider, UnifiedLanguage } from './types';
import { pickLocalized } from './i18n';

interface LanguageDefinition {
  code: UnifiedLanguage;
  labelZhHans: string;
  labelEn: string;
  aiLabel: string;
  providerCodes: {
    baidu?: string;
    tencent?: string;
  };
}

const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    code: 'auto',
    labelZhHans: '自动检测',
    labelEn: 'Auto Detect',
    aiLabel: 'auto-detect',
    providerCodes: { baidu: 'auto', tencent: 'auto' },
  },
  {
    code: 'en',
    labelZhHans: '英语',
    labelEn: 'English',
    aiLabel: 'English',
    providerCodes: { baidu: 'en', tencent: 'en' },
  },
  {
    code: 'zh-Hans',
    labelZhHans: '简体中文',
    labelEn: 'Simplified Chinese',
    aiLabel: 'Simplified Chinese',
    providerCodes: { baidu: 'zh', tencent: 'zh' },
  },
  {
    code: 'zh-Hant',
    labelZhHans: '繁体中文',
    labelEn: 'Traditional Chinese',
    aiLabel: 'Traditional Chinese',
    providerCodes: { baidu: 'cht', tencent: 'zh-TW' },
  },
  {
    code: 'ja',
    labelZhHans: '日语',
    labelEn: 'Japanese',
    aiLabel: 'Japanese',
    providerCodes: { baidu: 'jp', tencent: 'ja' },
  },
  {
    code: 'ko',
    labelZhHans: '韩语',
    labelEn: 'Korean',
    aiLabel: 'Korean',
    providerCodes: { baidu: 'kor', tencent: 'ko' },
  },
  {
    code: 'fr',
    labelZhHans: '法语',
    labelEn: 'French',
    aiLabel: 'French',
    providerCodes: { baidu: 'fra', tencent: 'fr' },
  },
  {
    code: 'de',
    labelZhHans: '德语',
    labelEn: 'German',
    aiLabel: 'German',
    providerCodes: { baidu: 'de', tencent: 'de' },
  },
  {
    code: 'es',
    labelZhHans: '西班牙语',
    labelEn: 'Spanish',
    aiLabel: 'Spanish',
    providerCodes: { baidu: 'spa', tencent: 'es' },
  },
  {
    code: 'ru',
    labelZhHans: '俄语',
    labelEn: 'Russian',
    aiLabel: 'Russian',
    providerCodes: { baidu: 'ru', tencent: 'ru' },
  },
];

const LANGUAGE_INDEX = new Map(LANGUAGE_DEFINITIONS.map((item) => [item.code, item]));

export function getSourceLanguageOptions() {
  return LANGUAGE_DEFINITIONS.map((item, index) => ({
    key: `source-${index}`,
    label: pickLocalized(item.labelZhHans, item.labelEn),
    value: item.code,
  }));
}

export function getTargetLanguageOptions() {
  return LANGUAGE_DEFINITIONS.filter((item) => item.code !== 'auto').map((item, index) => ({
    key: `target-${index}`,
    label: pickLocalized(item.labelZhHans, item.labelEn),
    value: item.code,
  }));
}

export function getLanguageLabel(language: UnifiedLanguage): string {
  const definition = LANGUAGE_INDEX.get(language);
  return definition ? pickLocalized(definition.labelZhHans, definition.labelEn) : language;
}

export function getAiLanguageLabel(language: UnifiedLanguage): string {
  return LANGUAGE_INDEX.get(language)?.aiLabel ?? language;
}

export function toProviderLanguage(provider: TranslationProvider, language: UnifiedLanguage): string {
  if (provider === 'ai') {
    return language;
  }

  const definition = LANGUAGE_INDEX.get(language);
  const mappedCode = definition?.providerCodes[provider];

  if (!mappedCode) {
    throw new Error(
      pickLocalized(
        `当前翻译服务不支持语言 ${language}。`,
        `The current translation provider does not support language ${language}.`
      )
    );
  }

  return mappedCode;
}

export function fromProviderLanguage(
  provider: Exclude<TranslationProvider, 'ai'>,
  languageCode?: string
): UnifiedLanguage | undefined {
  if (!languageCode) {
    return undefined;
  }

  const normalized = languageCode.toLowerCase();

  for (const definition of LANGUAGE_DEFINITIONS) {
    const candidate = definition.providerCodes[provider];
    if (candidate?.toLowerCase() === normalized) {
      return definition.code;
    }
  }

  return undefined;
}
