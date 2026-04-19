import { getProviderLabel } from './constants';
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

interface DiagnosticMessageOptions {
  code: string;
  stage: string;
  nextStep: string;
  provider?: TranslationProvider;
}

export function formatDiagnosticMessage(
  summary: string,
  { code, stage, nextStep, provider }: DiagnosticMessageOptions
): string {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);
  const lines = [summary.trim()];

  lines.push(t(`诊断码：${code}`, `Diagnostic code: ${code}`));
  lines.push(t(`失败层级：${stage}`, `Failure stage: ${stage}`));

  if (provider) {
    lines.push(t(`关联服务：${getProviderLabel(provider)}`, `Provider: ${getProviderLabel(provider)}`));
  }

  lines.push(t(`建议操作：${nextStep}`, `Next step: ${nextStep}`));
  return lines.join('\n');
}

function isTimeoutDetail(detail?: string): boolean {
  return Boolean(detail?.includes('超时') || detail?.toLowerCase().includes('timeout'));
}

function isLocalDevProxyInactive(detail?: string): boolean {
  const normalized = detail?.toLowerCase() ?? '';
  return normalized.includes('本地开发代理未生效') || normalized.includes('local development proxy is not active');
}

export function formatTranslationError(
  error: TranslationError,
  fallback = pickLocalized('翻译失败，请稍后重试。', 'Translation failed. Please try again later.')
): string {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  switch (error.kind) {
    case 'configuration':
      return formatDiagnosticMessage(
        error.detail?.trim() ||
          t(
            '本地配置不完整，请补全必填配置后重试。',
            'Configuration is incomplete. Please fill in the required settings and try again.'
          ),
        {
          code: 'RT-CONFIG-MISSING',
          stage: t('插件设置尚未满足当前翻译服务要求', 'Plugin settings are incomplete for the current provider'),
          nextStep: t(
            '打开插件设置，补全当前翻译服务的必填字段后再重试。',
            'Open plugin settings, complete the required provider fields, and try again.'
          ),
          provider: error.provider,
        }
      );
    case 'credential':
      return formatDiagnosticMessage(
        t(
          `凭证校验失败，请检查 Secret / API Key / 签名相关配置。${formatErrorDetail(error.detail)}`.trim(),
          `Credential validation failed. Please check your Secret / API Key / signature settings.${formatErrorDetail(
            error.detail
          )}`.trim()
        ),
        {
          code: 'RT-CREDENTIAL-REJECTED',
          stage: t('翻译服务已收到请求，但鉴权未通过', 'The provider received the request but rejected authentication'),
          nextStep: t(
            '优先核对 Secret / API Key / AppID / 签名算法；这类错误通常不是 RemNote 宿主拦截。',
            'Recheck Secret / API Key / AppID / signature settings first; this usually is not a RemNote host restriction.'
          ),
          provider: error.provider,
        }
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

        if (isLocalDevProxyInactive(error.detail)) {
          return formatDiagnosticMessage(
            t(
              `本地开发代理未生效。${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim(),
              `Local development proxy is not active.${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim()
            ),
            {
              code: 'RT-DEV-PROXY-INACTIVE',
              stage: t('localhost 调试代理没有接住请求', 'The localhost development proxy did not receive the request'),
              nextStep: t(
                '重启 `npm run dev`，确认仍在 localhost 调试环境后重试。',
                'Restart `npm run dev`, confirm you are still in localhost development mode, and try again.'
              ),
              provider: error.provider,
            }
          );
        }

        if (isTimeoutDetail(error.detail)) {
          return formatDiagnosticMessage(
            t(
              `请求超时，可能是网络、跨域或 RemNote 客户端环境拦截。${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim(),
              `Request timed out. This may be caused by network issues, CORS, or RemNote client restrictions.${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim()
            ),
            {
              code: 'RT-NET-TIMEOUT',
              stage: t(
                '请求在宿主环境或网络层等待超时，未稳定拿到服务响应',
                'The request timed out in the host or network layer before a stable provider response arrived'
              ),
              nextStep: t(
                '先重试一次；若稳定复现，记录该诊断码并检查网络、代理或 RemNote 客户端限制。',
                'Retry once; if it reproduces consistently, keep this diagnostic code and inspect network, proxy, or RemNote client restrictions.'
              ),
              provider: error.provider,
            }
          );
        }

        return formatDiagnosticMessage(
          t(
            `请求未成功发出，可能是网络、跨域或 RemNote 客户端环境拦截。${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim(),
            `Request failed before completion. This may be caused by network issues, CORS, or RemNote client restrictions.${cannotVerifyCredentialHint}${localDevelopmentHint}${providerHint}`.trim()
          ),
          {
            code: 'RT-NET-BLOCKED',
            stage: t(
              '请求在到达翻译服务之前，被浏览器、跨域策略或 RemNote 宿主环境拦截',
              'The request was blocked by the browser, CORS policy, or RemNote host before reaching the provider'
            ),
            nextStep: t(
              '这类失败优先看宿主/跨域链路，不要先怀疑凭证；再次失败时直接保留该诊断码截图。',
              'Treat this as a host/CORS path issue before suspecting credentials; keep this diagnostic code in the next screenshot.'
            ),
            provider: error.provider,
          }
        );
      }
    case 'service':
      return formatDiagnosticMessage(
        error.detail?.trim()
          ? t(`服务端返回错误：${error.detail.trim()}`, `Service returned an error: ${error.detail.trim()}`)
          : typeof error.status === 'number'
            ? t(
                `服务端返回错误（HTTP ${error.status}）。`,
                `Service returned an error (HTTP ${error.status}).`
              )
            : t('服务端返回错误，请稍后重试。', 'Service returned an error. Please try again later.'),
        {
          code: 'RT-SERVICE-ERROR',
          stage: t('翻译服务已收到请求，并返回了明确错误', 'The provider received the request and returned an explicit error'),
          nextStep: t(
            '优先记录 HTTP 状态码和返回详情；401/403 往往是凭证问题，429 往往是限流。',
            'Record the HTTP status and response detail first; 401/403 usually indicates credentials, while 429 usually indicates rate limiting.'
          ),
          provider: error.provider,
        }
      );
    case 'unknown':
      return formatDiagnosticMessage(
        error.detail?.trim()
          ? t(`未知错误：${error.detail.trim()}`, `Unknown error: ${error.detail.trim()}`)
          : fallback,
        {
          code: 'RT-UNKNOWN',
          stage: t('未命中已知错误分类', 'The failure did not match any known error category'),
          nextStep: t(
            '保留完整报错截图和诊断码，继续补充新的分类分支。',
            'Keep the full screenshot and diagnostic code so the next failure can be classified explicitly.'
          ),
          provider: error.provider,
        }
      );
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
