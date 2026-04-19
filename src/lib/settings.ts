import type { RNPlugin } from '@remnote/plugin-sdk';

import {
  DEFAULT_AI_BASE_URL,
  DEFAULT_AI_PROMPT_TEMPLATE,
  DEFAULT_TRANSLATE_SHORTCUT,
  SETTING_IDS,
} from './constants';
import { getSourceLanguageOptions, getTargetLanguageOptions } from './languages';
import { pickLocalized } from './i18n';
import { getDefaultProviderForCurrentRuntime } from './runtime';
import type { TranslationProvider, TranslationRuntimeSettings, UnifiedLanguage } from './types';

export function normalizeConfiguredProvider(value: unknown): TranslationProvider {
  return value === 'ai' ? 'ai' : getDefaultProviderForCurrentRuntime();
}

export async function registerPluginSettings(plugin: RNPlugin): Promise<void> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.provider,
    title: t('翻译服务', 'Translation Provider'),
    description: t('选择插件使用的翻译服务。当前版本仅保留 AI 翻译。', 'Choose the translation service used by the plugin. This release keeps AI Translate only.'),
    defaultValue: getDefaultProviderForCurrentRuntime(),
    options: [
      {
        key: 'provider-ai',
        label: t('AI 翻译（OpenAI-compatible）', 'AI Translate (OpenAI-compatible)'),
        value: 'ai',
      },
    ],
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.sourceLanguage,
    title: t('源语言', 'Source Language'),
    description: t('默认翻译前的语言。', 'Default source language.'),
    defaultValue: 'en',
    options: getSourceLanguageOptions(),
  });

  await plugin.settings.registerDropdownSetting({
    id: SETTING_IDS.targetLanguage,
    title: t('目标语言', 'Target Language'),
    description: t('默认翻译后的语言。', 'Default target language.'),
    defaultValue: 'zh-Hans',
    options: getTargetLanguageOptions(),
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_IDS.translateShortcut,
    title: t('翻译快捷键', 'Translate Shortcut'),
    description: t(
      '用于 Translate Selection Or Clipboard 命令，格式示例：mod+shift+t。填 none/off/disable 可关闭快捷键绑定。',
      'Used by the "Translate Selection Or Clipboard" command. Example: mod+shift+t. Enter none/off/disable to disable the shortcut.'
    ),
    defaultValue: DEFAULT_TRANSLATE_SHORTCUT,
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTING_IDS.testConnectionTrigger,
    title: t('测试当前翻译服务（切换执行）', 'Test Current Provider (toggle to run)'),
    description: t(
      '在插件设置里切换这个开关即可测试当前选中的翻译服务。想再次测试时，先关再开；也可以用命令面板执行 Test Translation Provider Connectivity。',
      'Toggle this switch to test the currently selected provider. To test again, switch it off then on, or run "Test Translation Provider Connectivity" from the command palette.'
    ),
    defaultValue: false,
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_IDS.aiBaseUrl,
    title: 'AI Base URL',
    description: t(
      'OpenAI-compatible 服务根路径，例如 https://api.openai.com/v1 。',
      'Root URL of the OpenAI-compatible API, for example https://api.openai.com/v1.'
    ),
    defaultValue: DEFAULT_AI_BASE_URL,
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_IDS.aiApiKey,
    title: 'AI API Key',
    description: t('使用 AI 翻译时必填。', 'Required when using AI Translate.'),
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_IDS.aiModel,
    title: 'AI Model',
    description: t(
      '例如 gpt-4.1-mini、gpt-4o-mini 或兼容模型名。',
      'For example: gpt-4.1-mini, gpt-4o-mini, or any compatible model.'
    ),
    defaultValue: '',
  });

  await plugin.settings.registerStringSetting({
    id: SETTING_IDS.aiPromptTemplate,
    title: 'AI Prompt Template',
    description: t(
      '支持 {{sourceLanguage}} / {{targetLanguage}} / {{text}} 占位符。',
      'Supports placeholders: {{sourceLanguage}} / {{targetLanguage}} / {{text}}.'
    ),
    defaultValue: DEFAULT_AI_PROMPT_TEMPLATE,
    multiline: true,
  });
}

export function resolveTranslateShortcut(value: string | null | undefined): string | undefined {
  const normalized = (value ?? '').trim();

  if (!normalized) {
    return DEFAULT_TRANSLATE_SHORTCUT;
  }

  if (['none', 'off', 'disable'].includes(normalized.toLowerCase())) {
    return undefined;
  }

  return normalized;
}

export async function loadRuntimeSettings(plugin: RNPlugin): Promise<TranslationRuntimeSettings> {
  const [
    provider,
    sourceLanguage,
    targetLanguage,
    aiBaseUrl,
    aiApiKey,
    aiModel,
    aiPromptTemplate,
  ] = await Promise.all([
    plugin.settings.getSetting<TranslationProvider>(SETTING_IDS.provider),
    plugin.settings.getSetting<UnifiedLanguage>(SETTING_IDS.sourceLanguage),
    plugin.settings.getSetting<UnifiedLanguage>(SETTING_IDS.targetLanguage),
    plugin.settings.getSetting<string>(SETTING_IDS.aiBaseUrl),
    plugin.settings.getSetting<string>(SETTING_IDS.aiApiKey),
    plugin.settings.getSetting<string>(SETTING_IDS.aiModel),
    plugin.settings.getSetting<string>(SETTING_IDS.aiPromptTemplate),
  ]);

  return {
    provider: normalizeConfiguredProvider(provider),
    sourceLanguage: sourceLanguage ?? 'en',
    targetLanguage: targetLanguage ?? 'zh-Hans',
    baiduAppId: '',
    baiduSecretKey: '',
    tencentSecretId: '',
    tencentSecretKey: '',
    aiBaseUrl: (aiBaseUrl ?? DEFAULT_AI_BASE_URL).trim(),
    aiApiKey: (aiApiKey ?? '').trim(),
    aiModel: (aiModel ?? '').trim(),
    aiPromptTemplate: (aiPromptTemplate ?? DEFAULT_AI_PROMPT_TEMPLATE).trim(),
  };
}
