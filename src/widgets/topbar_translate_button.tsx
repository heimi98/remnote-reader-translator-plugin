import { renderWidget } from '@remnote/plugin-sdk';

import '../style.css';
import '../index.css';
import { installSdkUnknownEventGuard } from '../lib/sdkGuard';

installSdkUnknownEventGuard();

function TopbarTranslateButton() {
  return null;
}

renderWidget(TopbarTranslateButton);
