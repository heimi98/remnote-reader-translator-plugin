import { useEffect, useState } from 'react';

export type UiLanguage = 'zh-Hans' | 'en';

function normalizeLocale(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replaceAll('_', '-');
}

function isLocaleLike(value: string): boolean {
  const normalized = normalizeLocale(value);

  if (!normalized) {
    return false;
  }

  if (normalized.length >= 2 && normalized.length <= 5 && /^[a-z]+$/.test(normalized)) {
    return true;
  }

  return /^[a-z]{2,3}(-[a-z0-9]{2,8}){1,3}$/.test(normalized);
}

function readNestedString(root: unknown, path: string[]): string {
  let current = root as Record<string, unknown> | undefined;

  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return '';
    }

    current = current[key] as Record<string, unknown> | undefined;
  }

  return typeof current === 'string' ? current : '';
}

function readGlobalLocale(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const anyWindow = window as unknown as Record<string, unknown>;
  const directCandidates = [
    anyWindow.remnoteLocale,
    anyWindow.__remnoteLocale,
    anyWindow.__REMNOTE_LOCALE__,
    anyWindow.__APP_LOCALE__,
    (anyWindow.i18next as { language?: unknown } | undefined)?.language,
  ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));

  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  const nestedPaths = [
    ['remnote', 'i18n', 'language'],
    ['remnote', 'i18n', 'locale'],
    ['remnote', 'store', 'state', 'language'],
    ['remnote', 'store', 'state', 'locale'],
    ['__APP_STATE__', 'language'],
    ['__APP_STATE__', 'locale'],
  ];

  for (const path of nestedPaths) {
    const value = readNestedString(anyWindow, path);
    if (value.trim()) {
      return value;
    }
  }

  return '';
}

function parseLocaleFromValue(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const nested = [
        parsed.language,
        parsed.locale,
        parsed.lang,
        parsed.i18nLanguage,
        parsed.i18nLocale,
      ].find((item): item is string => typeof item === 'string' && Boolean(item.trim()));

      return typeof nested === 'string' ? nested.trim() : '';
    } catch {
      return '';
    }
  }

  return trimmed;
}

function readStorageLocale(storage: Storage | undefined): string {
  if (!storage) {
    return '';
  }

  const preferredKeys = [
    'i18nextLng',
    'remnote-language',
    'remnote-locale',
    'rn-language',
    'rn-locale',
    'remnote.i18n.language',
    'remnote.i18n.locale',
    'remnote:language',
    'remnote:locale',
  ];

  for (const key of preferredKeys) {
    const raw = storage.getItem(key);
    if (!raw) {
      continue;
    }

    const locale = parseLocaleFromValue(raw);
    if (!locale || !isLocaleLike(locale)) {
      continue;
    }

    return locale;
  }

  let fallback: { key: string; locale: string; score: number } | null = null;

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (!lowerKey.includes('i18n') && !lowerKey.includes('locale') && !lowerKey.includes('language')) {
      continue;
    }

    const raw = storage.getItem(key);
    if (!raw) {
      continue;
    }

    const locale = parseLocaleFromValue(raw);
    if (!locale || !isLocaleLike(locale)) {
      continue;
    }

    let score = 1;
    if (lowerKey.includes('remnote')) {
      score += 8;
    }
    if (lowerKey.includes('i18n')) {
      score += 6;
    }
    if (lowerKey === 'language' || lowerKey === 'locale') {
      score -= 3;
    }
    if (lowerKey.includes('app')) {
      score -= 1;
    }

    if (!fallback || score > fallback.score) {
      fallback = { key, locale, score };
    }
  }

  if (fallback) {
    return fallback.locale;
  }

  return '';
}

function resolveCurrentLocale(): string {
  if (typeof window !== 'undefined') {
    const globalLocale = readGlobalLocale();
    if (globalLocale) {
      return globalLocale;
    }

    const storageLocale = readStorageLocale(window.localStorage);
    if (storageLocale) {
      return storageLocale;
    }

    const sessionLocale = readStorageLocale(window.sessionStorage);
    if (sessionLocale) {
      return sessionLocale;
    }

  }

  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    const domLocale =
      root?.lang ||
      root?.getAttribute('data-language') ||
      root?.getAttribute('data-locale') ||
      root?.getAttribute('data-lang') ||
      root?.getAttribute('data-i18n-locale') ||
      document.body?.getAttribute('data-language') ||
      document.body?.getAttribute('data-locale') ||
      '';
    if (domLocale) {
      return domLocale;
    }
  }

  return '';
}

export function isSimplifiedChineseLocale(locale: string | null | undefined): boolean {
  const normalized = normalizeLocale(locale);

  if (!normalized) {
    return false;
  }

  if (
    normalized.startsWith('zh-hant') ||
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk') ||
    normalized.startsWith('zh-mo')
  ) {
    return false;
  }

  return (
    normalized.startsWith('zh-hans') ||
    normalized.startsWith('zh-cn') ||
    normalized.startsWith('zh-sg') ||
    normalized === 'zh'
  );
}

export function getUiLanguage(locale?: string | null): UiLanguage {
  return isSimplifiedChineseLocale(locale ?? resolveCurrentLocale()) ? 'zh-Hans' : 'en';
}

export function isSimplifiedChineseUi(locale?: string | null): boolean {
  return getUiLanguage(locale) === 'zh-Hans';
}

export function pickLocalized<T>(zhHansValue: T, englishValue: T, language?: UiLanguage): T {
  return (language ?? getUiLanguage()) === 'zh-Hans' ? zhHansValue : englishValue;
}

export function useUiLanguage(): UiLanguage {
  const [language, setLanguage] = useState<UiLanguage>(() => getUiLanguage());

  useEffect(() => {
    const syncLanguage = () => {
      setLanguage((current) => {
        const next = getUiLanguage();
        return current === next ? current : next;
      });
    };

    syncLanguage();

    const observer =
      typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
        ? new MutationObserver(syncLanguage)
        : null;

    if (observer && typeof document !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['lang', 'data-language', 'data-locale', 'data-lang', 'data-i18n-locale'],
      });

      if (document.body) {
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: ['data-language', 'data-locale', 'data-lang', 'data-i18n-locale'],
        });
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('languagechange', syncLanguage);
      window.addEventListener('storage', syncLanguage);
    }

    const intervalId =
      typeof window !== 'undefined' ? window.setInterval(syncLanguage, 1500) : undefined;

    return () => {
      observer?.disconnect();

      if (typeof window !== 'undefined') {
        window.removeEventListener('languagechange', syncLanguage);
        window.removeEventListener('storage', syncLanguage);
      }

      if (typeof intervalId === 'number') {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return language;
}
