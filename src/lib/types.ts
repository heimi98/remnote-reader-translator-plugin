export type TranslationProvider = 'baidu' | 'tencent' | 'ai';

export type UnifiedLanguage =
  | 'auto'
  | 'en'
  | 'zh-Hans'
  | 'zh-Hant'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'ru';

export interface TranslationRequest {
  text: string;
  sourceLanguage: UnifiedLanguage;
  targetLanguage: UnifiedLanguage;
  provider: TranslationProvider;
}

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage?: UnifiedLanguage;
  provider: TranslationProvider;
  providerLabel: string;
}

export interface TranslationRuntimeSettings {
  provider: TranslationProvider;
  sourceLanguage: UnifiedLanguage;
  targetLanguage: UnifiedLanguage;
  baiduAppId: string;
  baiduSecretKey: string;
  tencentSecretId: string;
  tencentSecretKey: string;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiPromptTemplate: string;
}

export interface ReaderSelectionLike {
  text: string;
  type: string;
  remId?: string;
}

export interface TranslationPopupContext {
  text: string;
  remId?: string;
  readerType?: string;
}

export interface TranslationPopupState {
  status: 'loading' | 'success' | 'error';
  request: TranslationPopupContext;
  sourceLanguage?: UnifiedLanguage;
  targetLanguage?: UnifiedLanguage;
  provider?: TranslationProvider;
  result?: TranslationResult;
  errorMessage?: string;
  copied?: boolean;
}

