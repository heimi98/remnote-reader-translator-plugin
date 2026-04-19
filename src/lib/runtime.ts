import { getProviderLabel } from './constants';
import { pickLocalized } from './i18n';
import type { TranslationProvider } from './types';

export function isLocalDevelopmentOrigin(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

export function isSandboxRuntime(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.self !== window.top || Boolean(window.frameElement);
  } catch {
    return true;
  }
}

export function providerRequiresNativeRuntime(provider?: TranslationProvider): boolean {
  return provider === 'baidu' || provider === 'tencent';
}

export function isProviderSupportedInCurrentRuntime(provider: TranslationProvider): boolean {
  return provider === 'ai';
}

export function getDefaultProviderForCurrentRuntime(): TranslationProvider {
  return 'ai';
}

export function getUnsupportedProviderRuntimeDetail(provider: TranslationProvider): string {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);
  const providerLabel = getProviderLabel(provider);

  if (providerRequiresNativeRuntime(provider)) {
    return t(
      `${providerLabel} 已从当前插件版本中移除，不再作为可选翻译服务提供。请改用 AI 翻译。`,
      `${providerLabel} has been removed from the current plugin release and is no longer offered as a selectable provider. Use AI Translate instead.`
    );
  }

  return t(
    `${providerLabel} 在当前运行环境下不可用，请调整插件运行模式或改用其他翻译服务。`,
    `${providerLabel} is not available in the current runtime. Adjust the plugin runtime mode or use a different provider instead.`
  );
}
