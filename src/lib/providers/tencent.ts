import { getProviderLabel, TENCENT_DEFAULT_REGION } from '../constants';
import { bytesToHex, hmacSha256Bytes, sha256Hex } from '../crypto/hmac';
import {
  createTranslationError,
  fetchJson,
  resolveRuntimeFetchUrl,
  rethrowWithTranslationErrorProvider,
} from '../http';
import { pickLocalized } from '../i18n';
import { fromProviderLanguage, toProviderLanguage } from '../languages';
import type { TranslationRequest, TranslationResult, TranslationRuntimeSettings } from '../types';

interface TencentTranslateResponse {
  Response?: {
    Error?: {
      Code?: string;
      Message?: string;
    };
    Source?: string;
    Target?: string;
    TargetText?: string;
    RequestId?: string;
  };
}

const TENCENT_HOST = 'tmt.tencentcloudapi.com';
const TENCENT_ACTION = 'TextTranslate';
const TENCENT_VERSION = '2018-03-21';

function isTencentCredentialError(code?: string, message?: string): boolean {
  const normalizedCode = code ?? '';

  if (
    normalizedCode.startsWith('AuthFailure.') ||
    normalizedCode.includes('InvalidSecret') ||
    normalizedCode.includes('InvalidCredential') ||
    normalizedCode.includes('SignatureFailure') ||
    normalizedCode.includes('UnauthorizedOperation')
  ) {
    return true;
  }

  const normalizedMessage = message?.toLowerCase() ?? '';

  return (
    normalizedMessage.includes('credential') ||
    normalizedMessage.includes('signature') ||
    normalizedMessage.includes('secret') ||
    normalizedMessage.includes('unauthorized') ||
    normalizedMessage.includes('鉴权') ||
    normalizedMessage.includes('签名') ||
    normalizedMessage.includes('密钥') ||
    normalizedMessage.includes('未授权')
  );
}

export async function translateWithTencent(
  settings: TranslationRuntimeSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  if (!settings.tencentSecretId || !settings.tencentSecretKey) {
    throw createTranslationError({
      kind: 'configuration',
      provider: 'tencent',
      detail: t(
        '请先在插件设置中填写腾讯翻译的 SecretId 和 SecretKey。',
        'Please fill in Tencent SecretId and SecretKey in plugin settings first.'
      ),
    });
  }

  const requestBody = JSON.stringify({
    SourceText: request.text,
    Source: toProviderLanguage('tencent', request.sourceLanguage),
    Target: toProviderLanguage('tencent', request.targetLanguage),
    ProjectId: 0,
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const hashedPayload = await sha256Hex(requestBody);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${TENCENT_HOST}\nx-tc-action:${TENCENT_ACTION.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;

  const credentialScope = `${date}/tmt/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const secretDate = await hmacSha256Bytes(`TC3${settings.tencentSecretKey}`, date);
  const secretService = await hmacSha256Bytes(secretDate, 'tmt');
  const secretSigning = await hmacSha256Bytes(secretService, 'tc3_request');
  const signature = bytesToHex(await hmacSha256Bytes(secretSigning, stringToSign));

  const authorization = `TC3-HMAC-SHA256 Credential=${settings.tencentSecretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  let response: Response;
  let data: TencentTranslateResponse | undefined;

  try {
    ({ response, data } = await fetchJson<TencentTranslateResponse>(
      resolveRuntimeFetchUrl(`https://${TENCENT_HOST}`),
      {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json; charset=utf-8',
          'X-TC-Action': TENCENT_ACTION,
          'X-TC-Timestamp': timestamp.toString(),
          'X-TC-Version': TENCENT_VERSION,
          'X-TC-Region': TENCENT_DEFAULT_REGION,
        },
        body: requestBody,
      }
    ));
  } catch (error) {
    rethrowWithTranslationErrorProvider(error, 'tencent');
  }

  const payload = data?.Response;
  if (payload?.Error) {
    const detail = payload.Error.Message?.trim() || payload.Error.Code || t('未知错误', 'Unknown error');

    throw createTranslationError({
      kind: isTencentCredentialError(payload.Error.Code, payload.Error.Message)
        ? 'credential'
        : 'service',
      provider: 'tencent',
      code: payload.Error.Code,
      status: response.status,
      detail,
    });
  }

  if (!response.ok) {
    throw createTranslationError({
      kind: 'service',
      provider: 'tencent',
      status: response.status,
      detail: t(
        `腾讯翻译请求失败（HTTP ${response.status}）。`,
        `Tencent translation request failed (HTTP ${response.status}).`
      ),
    });
  }

  if (!payload?.TargetText) {
    throw createTranslationError({
      kind: 'service',
      provider: 'tencent',
      status: response.status,
      detail: t('腾讯翻译未返回译文。', 'Tencent translation returned an empty result.'),
    });
  }

  return {
    translatedText: payload.TargetText.trim(),
    detectedSourceLanguage:
      request.sourceLanguage === 'auto'
        ? fromProviderLanguage('tencent', payload.Source)
        : request.sourceLanguage,
    provider: 'tencent',
    providerLabel: getProviderLabel('tencent'),
  };
}
