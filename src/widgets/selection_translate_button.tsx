import { useEffect, useRef, useState } from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';

import '../style.css';
import '../index.css';

import {
  getSelectionOrClipboardText,
  getWidgetContextTrackedSelection,
  publishTrackedSelection,
  rememberSelectionText,
} from '../lib/selection';
import { getErrorMessage } from '../lib/http';
import { pickLocalized, useUiLanguage } from '../lib/i18n';
import { getLanguageLabel } from '../lib/languages';
import { installSdkUnknownEventGuard } from '../lib/sdkGuard';
import { loadRuntimeSettings } from '../lib/settings';
import { translateSelectionText } from '../lib/translation';

type TranslateStatus = 'idle' | 'loading' | 'success' | 'error';

interface InlineTranslationState {
  status: TranslateStatus;
  sourceText: string;
  translatedText: string;
  sourceLabel: 'selection' | 'clipboard';
  providerLabel?: string;
  sourceLanguageLabel?: string;
  targetLanguageLabel?: string;
  errorMessage?: string;
}

const INITIAL_STATE: InlineTranslationState = {
  status: 'idle',
  sourceText: '',
  translatedText: '',
  sourceLabel: 'selection',
};

installSdkUnknownEventGuard();

function SelectionTranslateButton() {
  const plugin = usePlugin();
  const language = useUiLanguage();
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en, language);
  const [isContextLoaded, setIsContextLoaded] = useState(false);
  const [state, setState] = useState<InlineTranslationState>(INITIAL_STATE);
  const requestTokenRef = useRef(0);
  const autoTriggeredRef = useRef(false);
  const widgetContextRef = useRef<any>();
  const lastPublishedSelectionKeyRef = useRef('');

  const runTranslate = async (): Promise<void> => {
    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;

    try {
      const contextSelection = getWidgetContextTrackedSelection(widgetContextRef.current);
      const selectionPayload = contextSelection?.text
        ? {
            text: contextSelection.text,
            source: 'selection' as const,
            readerType: contextSelection.readerType,
          }
        : {
            ...(await getSelectionOrClipboardText(plugin)),
            readerType: 'Selection' as const,
          };
      const { text, source, readerType } = selectionPayload;
      const normalizedText = text.trim();

      if (!normalizedText) {
        setState({
          status: 'error',
          sourceText: '',
          translatedText: '',
          sourceLabel: source === 'clipboard' ? 'clipboard' : 'selection',
          errorMessage: t(
            '没有读取到当前选中的文字或剪贴板文本。',
            'No selected text or clipboard text was found.'
          ),
        });
        return;
      }

      rememberSelectionText(normalizedText);
      await publishTrackedSelection(plugin, {
        text: normalizedText,
        source: source === 'clipboard' ? 'clipboard' : 'selection',
        readerType: readerType === 'PDF' ? 'PDF' : 'Selection',
      });
      setState({
        status: 'loading',
        sourceText: normalizedText,
        translatedText: '',
        sourceLabel: source === 'clipboard' ? 'clipboard' : 'selection',
      });

      const runtimeSettings = await loadRuntimeSettings(plugin);
      const result = await translateSelectionText(runtimeSettings, {
        text: normalizedText,
        sourceLanguage: runtimeSettings.sourceLanguage,
        targetLanguage: runtimeSettings.targetLanguage,
        provider: runtimeSettings.provider,
      });

      if (requestTokenRef.current !== requestToken) {
        return;
      }

      setState({
        status: 'success',
        sourceText: normalizedText,
        translatedText: result.translatedText,
        sourceLabel: source === 'clipboard' ? 'clipboard' : 'selection',
        providerLabel: result.providerLabel,
        sourceLanguageLabel: getLanguageLabel(runtimeSettings.sourceLanguage),
        targetLanguageLabel: getLanguageLabel(runtimeSettings.targetLanguage),
      });
    } catch (error) {
      if (requestTokenRef.current !== requestToken) {
        return;
      }

      setState({
        status: 'error',
        sourceText: '',
        translatedText: '',
        sourceLabel: 'selection',
        errorMessage: getErrorMessage(error),
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const syncWidgetContext = async () => {
      try {
        const nextContext = await (plugin.widget.getWidgetContext as () => Promise<any>)();
        if (cancelled) {
          return;
        }

        widgetContextRef.current = nextContext;
        const selection = getWidgetContextTrackedSelection(nextContext);

        if (selection?.text) {
          const publishedSelectionKey = JSON.stringify([selection.text, selection.readerType]);
          if (publishedSelectionKey !== lastPublishedSelectionKeyRef.current) {
            lastPublishedSelectionKeyRef.current = publishedSelectionKey;
            await publishTrackedSelection(plugin, {
              text: selection.text,
              source: 'selection',
              readerType: selection.readerType,
            });
          }
        }
      } catch {
        if (!cancelled) {
          widgetContextRef.current = undefined;
        }
      } finally {
        if (!cancelled) {
          setIsContextLoaded(true);
        }
      }
    };

    void syncWidgetContext();
    const intervalId = window.setInterval(() => {
      void syncWidgetContext();
    }, 500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [plugin]);

  useEffect(() => {
    if (!isContextLoaded || autoTriggeredRef.current) {
      return;
    }

    autoTriggeredRef.current = true;
    void runTranslate();
  }, [isContextLoaded]);

  return (
    <div className="space-y-2 px-2 py-1.5">
      <button
        className="reader-translate-button inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800"
        onMouseDown={(event) => {
          event.preventDefault();
        }}
        onClick={() => void runTranslate()}
        type="button"
      >
        <span aria-hidden>
          <svg fill="none" height="14" viewBox="0 0 24 24" width="14">
            <path
              d="M4.5 7.5h8M8.5 7.5c0 3.2-1.3 5.6-3.2 7M7 10.8c.8 1.2 2 2.4 3.3 3.2M13.8 7.2l4.8 9.6M17.2 12.2h-5.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.7"
            />
          </svg>
        </span>
        {state.status === 'loading' ? t('翻译中...', 'Translating...') : t('翻译', 'Translator')}
      </button>

      {state.status === 'loading' ? (
        <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
          {t('正在翻译：', 'Translating: ')}
          {state.sourceText}
        </div>
      ) : null}

      {state.status === 'success' ? (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs shadow-sm">
          <div className="flex flex-wrap items-center gap-2 text-slate-500">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
              {state.providerLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {state.sourceLanguageLabel}
              {' -> '}
              {state.targetLanguageLabel}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {state.sourceLabel === 'clipboard'
                ? t('来自剪贴板', 'From Clipboard')
                : t('来自选区', 'From Selection')}
            </span>
          </div>
          <div className="max-h-20 overflow-auto rounded-lg bg-slate-50 px-2 py-2 leading-5 text-slate-700">
            {state.translatedText}
          </div>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {state.errorMessage ?? t('翻译失败，请重试。', 'Translation failed. Please try again.')}
        </div>
      ) : null}
    </div>
  );
}

renderWidget(SelectionTranslateButton);
