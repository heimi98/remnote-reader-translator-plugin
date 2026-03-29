import { RNPlugin } from '@remnote/plugin-sdk';

let sdkGuardInstalled = false;

function isIgnorableUnknownEventError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return (
    message.includes('Invalid event setCustomCSS') ||
    message.includes('Invalid event setCustomCss')
  );
}

export function installSdkUnknownEventGuard(): void {
  if (sdkGuardInstalled) {
    return;
  }

  const proto = (RNPlugin as unknown as { prototype?: Record<string, unknown> }).prototype as
    | { _receive?: (event: MessageEvent) => void; __readerTranslatorReceivePatched?: boolean }
    | undefined;

  if (!proto || typeof proto._receive !== 'function' || proto.__readerTranslatorReceivePatched) {
    sdkGuardInstalled = true;
    return;
  }

  const originalReceive = proto._receive;
  proto._receive = function patchedReceive(this: unknown, event: MessageEvent) {
    try {
      return originalReceive.call(this, event);
    } catch (error) {
      if (isIgnorableUnknownEventError(error)) {
        return;
      }

      throw error;
    }
  };

  proto.__readerTranslatorReceivePatched = true;
  sdkGuardInstalled = true;
}
