import {
  SettingEvents,
  WidgetLocation,
  declareIndexPlugin,
  type ReactRNPlugin,
} from '@remnote/plugin-sdk';

import '../style.css';
import '../index.css';

import {
  PDF_HIGHLIGHT_POPUP_LOCATION,
  PDF_HIGHLIGHT_WIDGET_LOCATION,
  POPUP_WIDGET_NAME,
  getProviderLabel,
  SELECTION_BUTTON_WIDGET_NAME,
  SETTING_IDS,
} from '../lib/constants';
import { openTranslationPopup } from '../lib/popup';
import { getSelectionOrClipboardText } from '../lib/selection';
import { getErrorMessage } from '../lib/http';
import { pickLocalized } from '../lib/i18n';
import {
  loadRuntimeSettings,
  registerPluginSettings,
  resolveTranslateShortcut,
} from '../lib/settings';
import { installSdkUnknownEventGuard } from '../lib/sdkGuard';
import { testTranslationProviderConnectivity } from '../lib/translation';

let isConnectivityTestRunning = false;
installSdkUnknownEventGuard();

async function runConnectivityTest(plugin: ReactRNPlugin): Promise<void> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  if (isConnectivityTestRunning) {
    await plugin.app.toast(
      t(
        '翻译服务测试正在进行中，请稍候。',
        'Translation service connectivity test is already running. Please wait.'
      )
    );
    return;
  }

  isConnectivityTestRunning = true;

  try {
    const settings = await loadRuntimeSettings(plugin);
    const result = await testTranslationProviderConnectivity(settings);
    const preview = result.translatedText.replace(/\s+/g, ' ').slice(0, 48);

    await plugin.app.toast(
      t(`${result.providerLabel} 测试成功：${preview}`, `${result.providerLabel} test succeeded: ${preview}`)
    );
  } catch (error) {
    const settings = await loadRuntimeSettings(plugin).catch(() => null);
    const providerLabel = settings
      ? getProviderLabel(settings.provider)
      : t('当前翻译服务', 'Current translation provider');
    const message = getErrorMessage(error, t('测试失败，请检查配置。', 'Test failed. Please check your setup.'));

    await plugin.app.toast(
      t(`${providerLabel} 测试失败：${message}`, `${providerLabel} test failed: ${message}`)
    );
  } finally {
    isConnectivityTestRunning = false;
  }
}

async function onActivate(plugin: ReactRNPlugin) {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  await registerPluginSettings(plugin);
  const translateTabIcon = `${plugin.rootURL}translate-tab.svg`;
  const translateShortcut = resolveTranslateShortcut(
    await plugin.settings.getSetting<string>(SETTING_IDS.translateShortcut)
  );

  await plugin.app.registerWidget(POPUP_WIDGET_NAME, WidgetLocation.Popup, {
    dimensions: { height: 'auto', width: 680 },
  });

  await plugin.app.registerWidget('translator_sidebar', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
    widgetTabTitle: t('翻译', 'Translator'),
    widgetTabIcon: translateTabIcon,
  });

  await plugin.app.registerCommand({
    id: 'translate-selection-or-clipboard',
    name: t('翻译选区或剪贴板', 'Translate Selection Or Clipboard'),
    description: t(
      '翻译当前选中文本，若无选区则回退读取剪贴板。',
      'Translate currently selected text, or fall back to clipboard text.'
    ),
    ...(translateShortcut ? { keyboardShortcut: translateShortcut } : {}),
    action: async () => {
      const { text, source } = await getSelectionOrClipboardText(plugin);

      if (!text) {
        await plugin.app.toast(
          t(
            '没有读取到选中文本。请先复制 PDF 里的选区，再按快捷键翻译。',
            'No selected text found. Please copy the PDF highlight first, then try the shortcut again.'
          )
        );
        return;
      }

      await openTranslationPopup(plugin, {
        text,
        readerType: source === 'clipboard' ? 'PDF / Clipboard' : 'Selection',
      });
    },
  });

  await plugin.app.registerCommand({
    id: 'test-translation-provider-connectivity',
    name: t('测试翻译服务连通性', 'Test Translation Provider Connectivity'),
    description: t(
      '测试当前翻译服务的凭证配置与网络可用性。',
      'Test credentials and network connectivity for the configured provider.'
    ),
    action: async () => {
      await runConnectivityTest(plugin);
    },
  });

  plugin.event.addListener(
    SettingEvents.SettingChanged,
    SETTING_IDS.testConnectionTrigger,
    async (args: { value?: unknown }) => {
      if (args?.value === true) {
        await runConnectivityTest(plugin);
      }
    }
  );

  plugin.event.addListener(
    SettingEvents.SettingChanged,
    SETTING_IDS.translateShortcut,
    async () => {
      await plugin.app.toast(
        t(
          '翻译快捷键已更新，若未立即生效请重载插件。',
          'Translation shortcut updated. Reload the plugin if it does not take effect immediately.'
        )
      );
    }
  );

  await plugin.app.registerWidget(SELECTION_BUTTON_WIDGET_NAME, WidgetLocation.SelectedTextMenu, {
    dimensions: { height: 'auto', width: '100%' },
    widgetTabTitle: t('翻译', 'Translator'),
    widgetTabIcon: translateTabIcon,
  });

  // The published docs expose these reader locations, but the npm SDK typings can lag behind.
  // We register them best-effort so newer RemNote builds can render the PDF selection button.
  try {
    await plugin.app.registerWidget(
      SELECTION_BUTTON_WIDGET_NAME,
      PDF_HIGHLIGHT_WIDGET_LOCATION as unknown as WidgetLocation,
      {
        dimensions: { height: 'auto', width: '100%' },
        widgetTabTitle: t('翻译', 'Translator'),
        widgetTabIcon: translateTabIcon,
      }
    );
  } catch {}

  try {
    await plugin.app.registerWidget(
      SELECTION_BUTTON_WIDGET_NAME,
      PDF_HIGHLIGHT_POPUP_LOCATION as unknown as WidgetLocation,
      {
        dimensions: { height: 'auto', width: '100%' },
        widgetTabTitle: t('翻译', 'Translator'),
        widgetTabIcon: translateTabIcon,
      }
    );
  } catch {}
}

async function onDeactivate(plugin: ReactRNPlugin) {
  await plugin.app.unregisterWidget(SELECTION_BUTTON_WIDGET_NAME, WidgetLocation.SelectedTextMenu);
  await plugin.app.unregisterWidget(POPUP_WIDGET_NAME, WidgetLocation.Popup);
  await plugin.app.unregisterWidget('translator_sidebar', WidgetLocation.RightSidebar);

  try {
    await plugin.app.unregisterWidget(
      SELECTION_BUTTON_WIDGET_NAME,
      PDF_HIGHLIGHT_WIDGET_LOCATION as unknown as WidgetLocation
    );
  } catch {}

  try {
    await plugin.app.unregisterWidget(
      SELECTION_BUTTON_WIDGET_NAME,
      PDF_HIGHLIGHT_POPUP_LOCATION as unknown as WidgetLocation
    );
  } catch {}
}

declareIndexPlugin(onActivate, onDeactivate);
