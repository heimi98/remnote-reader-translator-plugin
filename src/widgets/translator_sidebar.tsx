import { useEffect, useRef, useState } from 'react';
import { renderWidget, usePlugin } from '@remnote/plugin-sdk';

import '../style.css';
import '../index.css';

import { getErrorMessage } from '../lib/http';
import { pickLocalized, useUiLanguage } from '../lib/i18n';
import { getLanguageLabel } from '../lib/languages';
import { installSdkUnknownEventGuard } from '../lib/sdkGuard';
import { loadRuntimeSettings } from '../lib/settings';
import { useUiTheme } from '../lib/theme';
import { translateSelectionTextWithBridge } from '../lib/translationBridge';

type SidebarStatus = 'idle' | 'running' | 'success' | 'error';

interface SidebarTranslationState {
  status: SidebarStatus;
  translatedText: string;
  providerLabel?: string;
  sourceLanguageLabel?: string;
  targetLanguageLabel?: string;
  errorMessage?: string;
}

const INITIAL_STATE: SidebarTranslationState = {
  status: 'idle',
  translatedText: '',
};

installSdkUnknownEventGuard();

function syncTextareaHeight(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) {
    return;
  }

  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
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

function TranslatorSidebar() {
  const plugin = usePlugin();
  const language = useUiLanguage();
  const theme = useUiTheme();
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en, language);
  const [inputText, setInputText] = useState('');
  const [state, setState] = useState<SidebarTranslationState>(INITIAL_STATE);
  const [copied, setCopied] = useState(false);
  const requestTokenRef = useRef(0);
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const outputTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    syncTextareaHeight(inputTextareaRef.current);
  }, [inputText]);

  useEffect(() => {
    syncTextareaHeight(outputTextareaRef.current);
  }, [state.translatedText, state.status]);

  const runTranslate = async (
    preferredText?: string,
    options?: { toastOnError?: boolean }
  ): Promise<void> => {
    const requestToken = requestTokenRef.current + 1;
    requestTokenRef.current = requestToken;

    const sourceText = (preferredText ?? inputText).trim();
    if (!sourceText) {
      const errorMessage = t(
        '请输入或粘贴要翻译的文本。',
        'Please enter or paste text to translate.'
      );
      setState({
        status: 'error',
        translatedText: '',
        errorMessage,
      });
      if (options?.toastOnError) {
        await plugin.app.toast(errorMessage);
      }
      return;
    }

    try {
      setState({
        status: 'running',
        translatedText: '',
      });
      setCopied(false);

      const runtimeSettings = await loadRuntimeSettings(plugin);
      const result = await translateSelectionTextWithBridge(plugin, runtimeSettings, {
        text: sourceText,
        sourceLanguage: runtimeSettings.sourceLanguage,
        targetLanguage: runtimeSettings.targetLanguage,
        provider: runtimeSettings.provider,
      });

      if (requestTokenRef.current !== requestToken) {
        return;
      }

      const translatedText = result.translatedText.trim();
      if (!translatedText) {
        throw new Error(t('翻译服务未返回译文。', 'The translation service returned an empty result.'));
      }

      setState({
        status: 'success',
        translatedText,
        providerLabel: result.providerLabel,
        sourceLanguageLabel: getLanguageLabel(runtimeSettings.sourceLanguage),
        targetLanguageLabel: getLanguageLabel(runtimeSettings.targetLanguage),
      });
    } catch (error) {
      if (requestTokenRef.current !== requestToken) {
        return;
      }

      const errorMessage = getErrorMessage(error);
      setState({
        status: 'error',
        translatedText: '',
        errorMessage,
      });
      if (options?.toastOnError) {
        await plugin.app.toast(errorMessage);
      }
    }
  };

  const statusLabel =
    state.status === 'running'
      ? t('翻译中', 'Translating')
      : state.status === 'success'
        ? t('已完成', 'Done')
        : state.status === 'error'
          ? t('失败', 'Failed')
          : t('待输入', 'Ready');

  const outputPlaceholder =
    state.status === 'running'
      ? t('正在翻译输入内容...', 'Translating input...')
      : state.status === 'idle'
        ? t('译文会显示在这里。', 'Translation will appear here.')
        : '';
  const canCopy = state.translatedText.trim().length > 0;

  return (
    <div
      className={`reader-translator-sidebar h-full w-full ${
        theme === 'dark' ? 'reader-translator-sidebar--dark' : 'reader-translator-sidebar--light'
      }`}
    >
      <div className="reader-sidebar-shell">
        <header className="reader-sidebar-header">
          <div className="reader-sidebar-title-group">
            <span className="reader-sidebar-title-icon" aria-hidden>
              <svg fill="none" height="19" viewBox="0 0 24 24" width="19">
                <path
                  d="M5.75 7.25H13.5M9.5 7.25C9.5 12.95 7.22 16.75 4 18.25M8 11C9.1 12.96 10.92 14.8 13 15.75"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
                <path
                  d="M14.5 6.5L20 17.5M17.9 13.3H11.1"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.7"
                />
              </svg>
            </span>
            <div>
              <div className="reader-sidebar-eyebrow">{t('阅读翻译', 'Reader Translator')}</div>
              <h2 className="reader-sidebar-title">{t('翻译', 'Translator')}</h2>
            </div>
          </div>
          <span className={`reader-sidebar-status reader-sidebar-status--${state.status}`}>{statusLabel}</span>
        </header>

        <section className="reader-sidebar-section">
          <div className="reader-sidebar-label-row">
            <div className="reader-sidebar-label">{t('原文', 'Original')}</div>
            <div className="reader-sidebar-caption">{t('粘贴后自动翻译', 'Auto on paste')}</div>
          </div>
          <textarea
            className="reader-sidebar-textarea"
            onChange={(event) => {
              setInputText(event.target.value);
            }}
            onPaste={(event) => {
              const pastedText = event.clipboardData.getData('text/plain');
              event.preventDefault();
              setInputText(pastedText);
              void runTranslate(pastedText);
            }}
            placeholder={t('在这里粘贴或输入要翻译的文本...', 'Paste or type text to translate...')}
            ref={inputTextareaRef}
            value={inputText}
          />
        </section>

        <div className="reader-sidebar-actions">
          <button
            className="reader-sidebar-primary-button"
            onClick={() =>
              void runTranslate(undefined, {
                toastOnError: true,
              })
            }
            type="button"
          >
            <span aria-hidden className="reader-sidebar-button-icon">
              <svg fill="none" height="16" viewBox="0 0 24 24" width="16">
                <path
                  d="M5 12h9M10 7l5 5-5 5M16.5 6.5h2A1.5 1.5 0 0 1 20 8v8a1.5 1.5 0 0 1-1.5 1.5h-2"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </span>
            {state.status === 'running' ? t('翻译中...', 'Translating...') : t('翻译', 'Translate')}
          </button>
          <button
            className="reader-sidebar-secondary-button"
            onClick={() => {
              requestTokenRef.current += 1;
              setInputText('');
              setState(INITIAL_STATE);
            }}
            type="button"
          >
            {t('清空', 'Clear')}
          </button>
        </div>

        <section className="reader-sidebar-section reader-sidebar-section--output">
          <div className="reader-sidebar-label-row">
            <div className="reader-sidebar-label">{t('译文', 'Translation')}</div>
            <div className="reader-sidebar-chips">
              <button
                className="reader-sidebar-copy-button"
                disabled={!canCopy}
                onClick={async () => {
                  if (!canCopy) {
                    return;
                  }

                  try {
                    await copyText(state.translatedText);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1400);
                    await plugin.app.toast(t('译文已复制。', 'Translation copied.'));
                  } catch (error) {
                    await plugin.app.toast(
                      getErrorMessage(error, t('复制失败，请手动复制。', 'Copy failed. Please copy manually.'))
                    );
                  }
                }}
                type="button"
              >
                {copied ? t('已复制', 'Copied') : t('复制', 'Copy')}
              </button>
              {state.providerLabel ? <span className="reader-sidebar-chip">{state.providerLabel}</span> : null}
              {state.sourceLanguageLabel && state.targetLanguageLabel ? (
                <span className="reader-sidebar-chip">
                  {state.sourceLanguageLabel}
                  {' -> '}
                  {state.targetLanguageLabel}
                </span>
              ) : null}
            </div>
          </div>
          <textarea
            className="reader-sidebar-textarea"
            placeholder={outputPlaceholder}
            readOnly
            ref={outputTextareaRef}
            value={state.translatedText}
          />
        </section>

        {state.status === 'error' ? (
          <section className="reader-sidebar-error">{state.errorMessage}</section>
        ) : null}
      </div>
    </div>
  );
}

renderWidget(TranslatorSidebar);
