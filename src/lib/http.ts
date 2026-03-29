import type { TranslationProvider } from './types';
import { pickLocalized } from './i18n';

export interface ParsedHttpResponse<T = unknown> {
  response: Response;
  data: T | undefined;
  text: string;
}

export type TranslationErrorKind =
  | 'configuration'
  | 'credential'
  | 'network'
  | 'service'
  | 'unknown';

interface TranslationErrorOptions {
  kind: TranslationErrorKind;
  provider?: TranslationProvider;
  status?: number;
  code?: string;
  detail?: string;
  cause?: Error;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const LOCAL_DEV_PROXY_PATH = '/__reader_translator_proxy__';

export class TranslationError extends Error {
  readonly kind: TranslationErrorKind;
  readonly provider?: TranslationProvider;
  readonly status?: number;
  readonly code?: string;
  readonly detail?: string;
  readonly cause?: Error;

  constructor({ kind, provider, status, code, detail, cause }: TranslationErrorOptions) {
    super(detail ?? pickLocalized('翻译失败，请稍后重试。', 'Translation failed. Please try again later.'));
    this.name = 'TranslationError';
    this.kind = kind;
    this.provider = provider;
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function createTranslationError(options: TranslationErrorOptions): TranslationError {
  return new TranslationError(options);
}

export function isTranslationError(error: unknown): error is TranslationError {
  return error instanceof TranslationError;
}

function isLocalDevelopmentOrigin(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function getRequestUrlString(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }

  return null;
}

function isLocalDevelopmentProxyUrl(url: string | null): boolean {
  return Boolean(url?.includes(LOCAL_DEV_PROXY_PATH));
}

export function resolveRuntimeFetchUrl(url: string): string {
  if (!isLocalDevelopmentOrigin()) {
    return url;
  }

  return `${LOCAL_DEV_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

export function rethrowWithTranslationErrorProvider(
  error: unknown,
  provider: TranslationProvider
): never {
  if (isTranslationError(error)) {
    throw createTranslationError({
      kind: error.kind,
      provider,
      status: error.status,
      code: error.code,
      detail: error.detail,
      cause: error.cause,
    });
  }

  throw error;
}

function formatErrorDetail(detail?: string): string {
  return detail?.trim()
    ? pickLocalized(` 详情：${detail.trim()}`, ` Details: ${detail.trim()}`)
    : '';
}

export function formatTranslationError(
  error: TranslationError,
  fallback = pickLocalized('翻译失败，请稍后重试。', 'Translation failed. Please try again later.')
): string {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  switch (error.kind) {
    case 'configuration':
      return (
        error.detail?.trim() ||
        t(
          '本地配置不完整，请补全必填配置后重试。',
          'Configuration is incomplete. Please fill in the required settings and try again.'
        )
      );
    case 'credential':
      return t(
        `凭证校验失败，请检查 Secret / API Key / 签名相关配置。${formatErrorDetail(error.detail)}`.trim(),
        `Credential validation failed. Please check your Secret / API Key / signature settings.${formatErrorDetail(
          error.detail
        )}`.trim()
      );
    case 'network':
      {
        const cannotVerifyCredentialHint = error.provider
          ? t(
              ' 当前请求还没到达翻译服务，暂时无法判断凭证是否正确。',
              ' The request did not reach the translation provider, so credentials cannot be verified yet.'
            )
          : '';
        const localDevelopmentHint = isLocalDevelopmentOrigin()
          ? t(
              ' 你现在是通过 localhost 本地调试运行插件，这类失败通常是本地调试环境下的跨域限制。',
              ' You are running the plugin via localhost. This is often caused by local CORS restrictions.'
            )
          : '';
        const providerHint =
          error.provider === 'baidu' || error.provider === 'tencent'
            ? t(
                ' 这类服务在前端直连时更容易被跨域或宿主环境拦截。',
                ' These providers are more likely to be blocked by CORS or the host environment when called directly from frontend code.'
              )
            : error.provider === 'ai'
              ? t(
                  ' 请确认目标 AI 接口允许浏览器直连。',
                  ' Please verify the target AI endpoint allows direct browser requests.'
                )
              : '';

        if (error.detail?.includes('超时') || error.detail?.toLowerCase().includes('timeout')) {
          return t(
            `请求超时，可能是网络、跨域或 RemNote 客户端环境拦截。${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim(),
            `Request timed out. This may be caused by network issues, CORS, or RemNote client restrictions.${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim()
          );
        }

        return t(
          `请求未成功发出，可能是网络、跨域或 RemNote 客户端环境拦截。${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim(),
          `Request failed before completion. This may be caused by network issues, CORS, or RemNote client restrictions.${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim()
        );
      }
    case 'service':
      if (error.detail?.trim()) {
        return t(`服务端返回错误：${error.detail.trim()}`, `Service returned an error: ${error.detail.trim()}`);
      }

      if (typeof error.status === 'number') {
        return t(
          `服务端返回错误（HTTP ${error.status}）。`,
          `Service returned an error (HTTP ${error.status}).`
        );
      }

      return t('服务端返回错误，请稍后重试。', 'Service returned an error. Please try again later.');
    case 'unknown':
      return error.detail?.trim()
        ? t(`未知错误：${error.detail.trim()}`, `Unknown error: ${error.detail.trim()}`)
        : fallback;
    default:
      return fallback;
  }
}

export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ParsedHttpResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestUrl = getRequestUrlString(input);

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const proxyHandled = response.headers.get('x-reader-translator-proxy') === '1';

    if (response.status === 404 && isLocalDevelopmentProxyUrl(requestUrl) && !proxyHandled) {
      throw createTranslationError({
        kind: 'network',
        detail: pickLocalized(
          '本地开发代理未生效，请重启 `npm run dev` 后重试。',
          'Local development proxy is not active. Please restart `npm run dev` and try again.'
        ),
      });
    }

    const text = await response.text();
    let data: T | undefined;

    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = undefined;
      }
    }

    return { response, data, text };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw createTranslationError({
        kind: 'network',
        detail: pickLocalized('请求超时，请稍后重试。', 'Request timed out. Please try again later.'),
        cause: error,
      });
    }

    if (error instanceof TypeError) {
      throw createTranslationError({
        kind: 'network',
        detail: error.message,
        cause: error,
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function getErrorMessage(
  error: unknown,
  fallback = pickLocalized('翻译失败，请稍后重试。', 'Translation failed. Please try again later.')
): string {
  if (isTranslationError(error)) {
    return formatTranslationError(error, fallback);
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}
