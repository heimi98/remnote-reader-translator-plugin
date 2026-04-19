import { useEffect, useMemo, useState } from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';

import '../style.css';
import '../index.css';

import { getErrorMessage } from '../lib/http';
import { pickLocalized, useUiLanguage } from '../lib/i18n';
import { getLanguageLabel } from '../lib/languages';
import { installSdkUnknownEventGuard } from '../lib/sdkGuard';
import { loadRuntimeSettings } from '../lib/settings';
import { translateSelectionTextWithBridge } from '../lib/translationBridge';
import type { TranslationPopupContext, TranslationPopupState } from '../lib/types';

const EMPTY_CONTEXT: TranslationPopupContext = { text: '' };
installSdkUnknownEventGuard();

function getReaderTypeLabel(readerType: string | undefined, language: 'zh-Hans' | 'en'): string {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en, language);

  if (readerType === 'PDF') {
    return 'PDF';
  }

  if (readerType === 'WebReader') {
    return t('网页阅读器', 'Web Reader');
  }

  if (readerType === 'PDF / Clipboard') {
    return t('PDF / 剪贴板', 'PDF / Clipboard');
  }

  if (readerType === 'Selection') {
    return t('选区', 'Selection');
  }

  return t('阅读器', 'Reader');
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function TranslationPopup() {
  const plugin = usePlugin();
  const language = useUiLanguage();
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en, language);
  const [popupContext, setPopupContext] = useState<TranslationPopupContext>(EMPTY_CONTEXT);
  const [retryToken, setRetryToken] = useState(0);
  const [state, setState] = useState<TranslationPopupState>({
    status: 'loading',
    request: EMPTY_CONTEXT,
  });

  useEffect(() => {
    let cancelled = false;

    void ((plugin.widget.getWidgetContext as () => Promise<any>)()
      .then((context) => {
        if (!cancelled) {
          setPopupContext((context?.contextData as TranslationPopupContext | undefined) ?? EMPTY_CONTEXT);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPopupContext(EMPTY_CONTEXT);
        }
      }));

    return () => {
      cancelled = true;
    };
  }, [plugin]);

  const request = useMemo(
    () => ({
      text: popupContext.text?.trim() ?? '',
      remId: popupContext.remId,
      readerType: popupContext.readerType,
    }),
    [popupContext.readerType, popupContext.remId, popupContext.text]
  );

  useEffect(() => {
    let cancelled = false;

    if (!request.text) {
      setState({
        status: 'error',
        request,
        errorMessage: t('未找到可翻译的文本。', 'No translatable text was found.'),
      });
      return undefined;
    }

    void (async () => {
      try {
        const runtimeSettings = await loadRuntimeSettings(plugin);

        if (cancelled) {
          return;
        }

        setState({
          status: 'loading',
          request,
          provider: runtimeSettings.provider,
          sourceLanguage: runtimeSettings.sourceLanguage,
          targetLanguage: runtimeSettings.targetLanguage,
          copied: false,
        });

        const result = await translateSelectionTextWithBridge(plugin, runtimeSettings, {
          text: request.text,
          sourceLanguage: runtimeSettings.sourceLanguage,
          targetLanguage: runtimeSettings.targetLanguage,
          provider: runtimeSettings.provider,
        });

        if (cancelled) {
          return;
        }

        setState({
          status: 'success',
          request,
          provider: runtimeSettings.provider,
          sourceLanguage: runtimeSettings.sourceLanguage,
          targetLanguage: runtimeSettings.targetLanguage,
          result,
          copied: false,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setState({
          status: 'error',
          request,
          errorMessage: getErrorMessage(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [plugin, request, retryToken]);

  const sourceLanguageLabel = state.sourceLanguage ? getLanguageLabel(state.sourceLanguage) : '';
  const targetLanguageLabel = state.targetLanguage ? getLanguageLabel(state.targetLanguage) : '';

  return (
    <div className="reader-translation-shell p-4">
      <div className="reader-translation-panel rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t('阅读翻译', 'Reader Translator')}
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {t('划词翻译', 'Selected Text Translation')}
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {getReaderTypeLabel(request.readerType, language)}
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          <section className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {t('原文', 'Original')}
            </div>
            <div className="max-h-40 overflow-auto rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {request.text}
            </div>
          </section>

          {state.status === 'loading' ? (
            <section className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-5 text-sky-900">
              <div className="flex items-center gap-3">
                <span className="translation-spinner" />
                <div>
                  <div className="text-sm font-semibold">{t('正在翻译中...', 'Translating...')}</div>
                  <div className="mt-1 text-sm text-sky-700">
                    {t('正在调用服务并整理译文。', 'Calling the translation service and preparing result.')}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {state.status === 'success' ? (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                  {state.result?.providerLabel}
                </span>
                {sourceLanguageLabel && targetLanguageLabel ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
                    {sourceLanguageLabel}
                    {' -> '}
                    {targetLanguageLabel}
                  </span>
                ) : null}
              </div>
              <div className="max-h-72 overflow-auto rounded-2xl bg-slate-950 px-4 py-4 text-sm leading-7 text-slate-50 shadow-inner">
                {state.result?.translatedText}
              </div>
            </section>
          ) : null}

          {state.status === 'error' ? (
            <section className="rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-4 text-sm text-rose-800">
              <div className="font-semibold">{t('翻译失败', 'Translation Failed')}</div>
              <div className="mt-2 leading-6">{state.errorMessage}</div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="text-xs text-slate-500">
            {t(
              '支持 OpenAI-compatible AI 翻译服务。',
              'Supports OpenAI-compatible AI translation providers.'
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100"
              onClick={() => setRetryToken((value) => value + 1)}
              type="button"
            >
              {t('重试', 'Retry')}
            </button>
            <button
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              disabled={state.status !== 'success' || !state.result?.translatedText}
              onClick={async () => {
                if (!state.result?.translatedText) {
                  return;
                }

                try {
                  await copyText(state.result.translatedText);
                  setState((current) =>
                    current.status === 'success' ? { ...current, copied: true } : current
                  );
                  await plugin.app.toast(
                    t('译文已复制到剪贴板。', 'Translation copied to clipboard.')
                  );
                } catch (error) {
                  await plugin.app.toast(
                    getErrorMessage(
                      error,
                      t('复制失败，请手动复制。', 'Copy failed. Please copy manually.')
                    )
                  );
                }
              }}
              type="button"
            >
              {state.copied ? t('已复制', 'Copied') : t('复制译文', 'Copy Translation')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

renderWidget(TranslationPopup);
