import type { RNPlugin } from '@remnote/plugin-sdk';

import { POPUP_WIDGET_NAME } from './constants';
import type { TranslationPopupContext } from './types';

export async function openTranslationPopup(
  plugin: RNPlugin,
  context: TranslationPopupContext
): Promise<void> {
  await plugin.widget.openPopup(POPUP_WIDGET_NAME, context);
}

