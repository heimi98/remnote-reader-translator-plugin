# Reader Translator

Reader Translator is a RemNote plugin for translating copied text with OpenAI-compatible AI providers.

## Features

- Manual copy-and-translate workflow for PDF Reader and Web Reader (no direct highlight-to-translate)
- AI Translate only (OpenAI-compatible)
- Translation popup with copy output and retry support
- Sidebar translation entry (uses current selection first, then clipboard as fallback)

## How To Use

1. Install and enable the plugin in RemNote.
2. Open plugin settings and confirm AI Translate is selected.
3. Fill in AI provider credentials:
   - AI: `Base URL`, `API Key`, `Model`, and optional prompt template
4. Copy text you want to translate (especially in PDF Reader / Web Reader).
5. Trigger translation using one of these methods:
   - Shortcut: `mod+shift+t` (default)
   - Top bar translate button
   - Translator sidebar entry
6. Read the result in the popup, then copy or retry if needed.

## Configuration

You can configure the following in plugin settings:

- Translation provider
- Source language
- Target language
- Translation shortcut (default: `mod+shift+t`; use `none` / `off` / `disable` to disable)
- Provider credentials

## Development

```bash
npm install
npm run dev
```

In RemNote, go to `Settings -> Plugins -> Build -> Develop from localhost` and enter `http://localhost:8080`.

## Build And Package

```bash
npm run check-types
npm run build
```

After build, `PluginZip.zip` is generated in the project root and can be uploaded in RemNote plugin upload.

## Permissions

- `requiredScopes`: `All` + `Read`
- `requestNative`: `true`

## Privacy

This plugin sends selected or copied text to the AI translation provider you configure. It does not send text to other servers. Please review your provider's privacy policy before use.

## Notes

- This release keeps AI Translate only. Legacy Baidu/Tencent settings are ignored and fall back to AI automatically.
- The AI provider implementation follows OpenAI-compatible `POST /chat/completions`.
- Current versions translate text only and do not write translation results back into notes automatically.
