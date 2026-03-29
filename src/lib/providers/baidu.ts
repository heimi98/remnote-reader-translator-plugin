import { getProviderLabel } from '../constants';
import { md5 } from '../crypto/md5';
import {
  createTranslationError,
  fetchJson,
  resolveRuntimeFetchUrl,
  rethrowWithTranslationErrorProvider,
} from '../http';
import { pickLocalized } from '../i18n';
import { fromProviderLanguage, toProviderLanguage } from '../languages';
import type { TranslationRequest, TranslationResult, TranslationRuntimeSettings } from '../types';

interface BaiduTranslateResponse {
  error_code?: string;
  error_msg?: string;
  from?: string;
  to?: string;
  trans_result?: Array<{ src: string; dst: string }>;
}

const BAIDU_CREDENTIAL_ERROR_CODES = new Set(['52003', '54001']);

function isBaiduCredentialError(code?: string, message?: string): boolean {
  if (code && BAIDU_CREDENTIAL_ERROR_CODES.has(code)) {
    return true;
  }

  const normalizedMessage = message?.toLowerCase() ?? '';

  return (
    normalizedMessage.includes('signature') ||
    normalizedMessage.includes('sign') ||
    normalizedMessage.includes('secret') ||
    normalizedMessage.includes('appid') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('认证') ||
    normalizedMessage.includes('授权') ||
    normalizedMessage.includes('签名') ||
    normalizedMessage.includes('密钥')
  );
}

export async function translateWithBaidu(
  settings: TranslationRuntimeSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  if (!settings.baiduAppId || !settings.baiduSecretKey) {
    throw createTranslationError({
      kind: 'configuration',
      provider: 'baidu',
      detail: t(
        '请先在插件设置中填写百度翻译的 AppID 和 Secret Key。',
        'Please fill in Baidu AppID and Secret Key in plugin settings first.'
      ),
    });
  }

  const salt = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const from = toProviderLanguage('baidu', request.sourceLanguage);
  const to = toProviderLanguage('baidu', request.targetLanguage);
  const sign = md5(`${settings.baiduAppId}${request.text}${salt}${settings.baiduSecretKey}`);

  const body = new URLSearchParams({
    q: request.text,
    from,
    to,
    appid: settings.baiduAppId,
    salt,
    sign,
  });

  let response: Response;
  let data: BaiduTranslateResponse | undefined;

  try {
    ({ response, data } = await fetchJson<BaiduTranslateResponse>(
      resolveRuntimeFetchUrl('https://fanyi-api.baidu.com/api/trans/vip/translate'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: body.toString(),
      }
    ));
  } catch (error) {
    rethrowWithTranslationErrorProvider(error, 'baidu');
  }

  if (data?.error_code) {
    const detail = data.error_msg?.trim() || data.error_code;

    throw createTranslationError({
      kind: isBaiduCredentialError(data.error_code, data.error_msg) ? 'credential' : 'service',
      provider: 'baidu',
      code: data.error_code,
      status: response.status,
      detail,
    });
  }

  if (!response.ok) {
    throw createTranslationError({
      kind: 'service',
      provider: 'baidu',
      status: response.status,
      detail: t(
        `百度翻译请求失败（HTTP ${response.status}）。`,
        `Baidu translation request failed (HTTP ${response.status}).`
      ),
    });
  }

  const translatedText = data?.trans_result?.map((item) => item.dst).join('\n').trim();

  if (!translatedText) {
    throw createTranslationError({
      kind: 'service',
      provider: 'baidu',
      status: response.status,
      detail: t('百度翻译未返回译文。', 'Baidu translation returned an empty result.'),
    });
  }

  return {
    translatedText,
    detectedSourceLanguage:
      request.sourceLanguage === 'auto' ? fromProviderLanguage('baidu', data?.from) : request.sourceLanguage,
    provider: 'baidu',
    providerLabel: getProviderLabel('baidu'),
  };
}
