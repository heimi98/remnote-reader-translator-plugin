import type { RNPlugin } from '@remnote/plugin-sdk';
import { pickLocalized } from './i18n';

const RECENT_SELECTION_TTL_MS = 20_000;
const RECENT_CLIPBOARD_TTL_MS = 120_000;
const TRACKED_SELECTION_SESSION_KEY = 'reader-translator-tracked-selection';

let recentSelectionSnapshot: { text: string; timestamp: number } | null = null;
let recentClipboardSnapshot: { text: string; timestamp: number } | null = null;
let clipboardTrackingReady = false;

export interface TrackedSelectionSnapshot {
  text: string;
  source: 'selection' | 'clipboard';
  readerType: 'PDF' | 'Selection';
  updatedAt: number;
}

interface WidgetContextSelectionSnapshot {
  text: string;
  readerType: 'PDF' | 'Selection';
}

function rememberRecentSelection(text: string): void {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  recentSelectionSnapshot = {
    text: normalized,
    timestamp: Date.now(),
  };
}

function getRecentSelection(): string {
  if (!recentSelectionSnapshot) {
    return '';
  }

  if (Date.now() - recentSelectionSnapshot.timestamp > RECENT_SELECTION_TTL_MS) {
    recentSelectionSnapshot = null;
    return '';
  }

  return recentSelectionSnapshot.text;
}

function rememberRecentClipboard(text: string): void {
  const normalized = text.trim();
  if (!normalized) {
    return;
  }

  recentClipboardSnapshot = {
    text: normalized,
    timestamp: Date.now(),
  };
}

function getRecentClipboard(): string {
  if (!recentClipboardSnapshot) {
    return '';
  }

  if (Date.now() - recentClipboardSnapshot.timestamp > RECENT_CLIPBOARD_TTL_MS) {
    recentClipboardSnapshot = null;
    return '';
  }

  return recentClipboardSnapshot.text;
}

function richTextToPlainText(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (item && typeof item === 'object') {
        const maybeText = (item as { text?: unknown }).text;
        if (typeof maybeText === 'string') {
          return maybeText;
        }
      }

      return '';
    })
    .join('')
    .trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function rememberSelectionText(text: string): void {
  rememberRecentSelection(text);
}

export function rememberClipboardText(text: string): void {
  rememberRecentClipboard(text);
}

export function isTrackedSelectionFresh(
  snapshot: TrackedSelectionSnapshot | null | undefined,
  maxAgeMs: number
): snapshot is TrackedSelectionSnapshot {
  return Boolean(snapshot && Date.now() - snapshot.updatedAt <= maxAgeMs);
}

export function getTrackedSelectionIdentity(
  snapshot:
    | Pick<TrackedSelectionSnapshot, 'text' | 'source' | 'updatedAt'>
    | null
    | undefined
): string {
  if (!snapshot?.text.trim()) {
    return '';
  }

  return JSON.stringify([snapshot.text.trim(), snapshot.source, snapshot.updatedAt]);
}

function parseTrackedSelectionSnapshot(value: unknown): TrackedSelectionSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
  const source = candidate.source === 'clipboard' ? 'clipboard' : 'selection';
  const readerType = candidate.readerType === 'PDF' ? 'PDF' : 'Selection';
  const updatedAt =
    typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : 0;

  if (!text || !updatedAt) {
    return null;
  }

  return {
    text,
    source,
    readerType,
    updatedAt,
  };
}

export async function publishTrackedSelection(
  plugin: RNPlugin,
  payload: Omit<TrackedSelectionSnapshot, 'updatedAt'> & { updatedAt?: number }
): Promise<void> {
  const text = payload.text.trim();
  if (!text) {
    return;
  }

  const snapshot: TrackedSelectionSnapshot = {
    text,
    source: payload.source === 'clipboard' ? 'clipboard' : 'selection',
    readerType: payload.readerType === 'PDF' ? 'PDF' : 'Selection',
    updatedAt: payload.updatedAt ?? Date.now(),
  };

  try {
    await plugin.storage.setSession(TRACKED_SELECTION_SESSION_KEY, snapshot);
  } catch {
    // Ignore storage write failures to avoid blocking translation flow.
  }
}

export async function readTrackedSelection(plugin: RNPlugin): Promise<TrackedSelectionSnapshot | null> {
  try {
    const value = await plugin.storage.getSession(TRACKED_SELECTION_SESSION_KEY);
    return parseTrackedSelectionSnapshot(value);
  } catch {
    return null;
  }
}

function getDomSelectionText(): string {
  const direct = window.getSelection?.()?.toString().trim();
  if (direct) {
    return direct;
  }

  const documentSelection = document.getSelection?.()?.toString().trim();
  return documentSelection ?? '';
}

function ensureClipboardTracking(): void {
  if (clipboardTrackingReady || typeof window === 'undefined') {
    return;
  }

  const onCopyOrCut: EventListener = (event) => {
    const clipboardText =
      (event as ClipboardEvent).clipboardData?.getData('text/plain')?.trim() ?? '';
    if (clipboardText) {
      rememberRecentClipboard(clipboardText);
      return;
    }

    const selectionText = getDomSelectionText();
    if (selectionText) {
      rememberRecentClipboard(selectionText);
    }
  };

  window.addEventListener('copy', onCopyOrCut);
  window.addEventListener('cut', onCopyOrCut);
  clipboardTrackingReady = true;
}

function getNestedValue(value: unknown, path: string[]): unknown {
  let current = value as Record<string, unknown> | undefined;

  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return undefined;
    }

    current = current[key] as Record<string, unknown> | undefined;
  }

  return current;
}

function tryReadWidgetSelectionCandidate(candidate: unknown): WidgetContextSelectionSnapshot | null {
  if (!isObject(candidate)) {
    return null;
  }

  const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
  const type = typeof candidate.type === 'string' ? candidate.type.trim() : '';

  if (!text) {
    return null;
  }

  return {
    text,
    readerType: type.toLowerCase().includes('pdf') ? 'PDF' : 'Selection',
  };
}

function inferReaderTypeFromContext(context: unknown): 'PDF' | 'Selection' {
  if (!isObject(context)) {
    return 'Selection';
  }

  const contextData = isObject(context.contextData) ? context.contextData : null;
  const nestedContext = isObject(context.context) ? context.context : null;
  const hints = [
    context.location,
    context.widgetLocation,
    context.type,
    contextData?.location,
    contextData?.widgetLocation,
    contextData?.type,
    nestedContext?.location,
    nestedContext?.widgetLocation,
    nestedContext?.type,
  ]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.toLowerCase());

  if (hints.some((value) => value.includes('pdf'))) {
    return 'PDF';
  }

  const hasPdfLikeRemId =
    typeof context.remId === 'string' ||
    typeof contextData?.remId === 'string' ||
    typeof nestedContext?.remId === 'string';

  return hasPdfLikeRemId ? 'PDF' : 'Selection';
}

function coerceToText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return richTextToPlainText(value);
  }

  if (value && typeof value === 'object') {
    const text = (value as { text?: unknown }).text;
    if (typeof text === 'string') {
      return text.trim();
    }
  }

  return '';
}

const WIDGET_SELECTION_TEXT_PATHS = [
  ['text'],
  ['selectedText'],
  ['selectionText'],
  ['readerSelection', 'text'],
  ['selection', 'text'],
  ['highlight', 'text'],
  ['richText'],
  ['data', 'text'],
  ['contextData', 'text'],
  ['contextData', 'selectedText'],
  ['contextData', 'selectionText'],
  ['contextData', 'readerSelection', 'text'],
  ['contextData', 'selection', 'text'],
  ['contextData', 'highlight', 'text'],
  ['contextData', 'richText'],
  ['contextData', 'data', 'text'],
  ['context', 'text'],
  ['context', 'selectedText'],
  ['context', 'selectionText'],
  ['context', 'readerSelection', 'text'],
  ['context', 'selection', 'text'],
  ['context', 'highlight', 'text'],
  ['context', 'richText'],
  ['context', 'data', 'text'],
];

export function getWidgetContextTrackedSelection(
  context: unknown
): WidgetContextSelectionSnapshot | null {
  const root = isObject(context) ? context : {};
  const contextData = isObject(root.contextData) ? root.contextData : null;
  const nestedContext = isObject(root.context) ? root.context : null;
  const selectionCandidates = [
    context,
    root.readerSelection,
    root.selection,
    contextData?.readerSelection,
    contextData?.selection,
    contextData,
    nestedContext?.readerSelection,
    nestedContext?.selection,
    nestedContext,
  ];

  for (const candidate of selectionCandidates) {
    const selection = tryReadWidgetSelectionCandidate(candidate);
    if (selection?.text) {
      rememberRecentSelection(selection.text);
      return {
        text: selection.text,
        readerType:
          selection.readerType === 'PDF' ? 'PDF' : inferReaderTypeFromContext(context),
      };
    }
  }

  for (const path of WIDGET_SELECTION_TEXT_PATHS) {
    const text = coerceToText(getNestedValue(context, path));
    if (text) {
      rememberRecentSelection(text);
      return {
        text,
        readerType: inferReaderTypeFromContext(context),
      };
    }
  }

  return null;
}

export function getWidgetContextSelectionText(context: unknown): string {
  const selection = getWidgetContextTrackedSelection(context);
  if (selection?.text) {
    return selection.text;
  }

  return '';
}

export async function getLiveSelectionText(plugin: RNPlugin): Promise<string> {
  const domSelection = getDomSelectionText();
  if (domSelection) {
    rememberRecentSelection(domSelection);
    return domSelection;
  }

  const editorSelection = await plugin.editor.getSelectedText();
  const editorText = richTextToPlainText(editorSelection?.richText);
  if (editorText) {
    rememberRecentSelection(editorText);
    return editorText;
  }

  return '';
}

export async function getCurrentSelectionText(plugin: RNPlugin): Promise<string> {
  const liveSelection = await getLiveSelectionText(plugin);
  if (liveSelection) {
    return liveSelection;
  }

  const recentSelection = getRecentSelection();
  if (recentSelection) {
    return recentSelection;
  }

  return '';
}

export async function getClipboardText(): Promise<string> {
  ensureClipboardTracking();

  try {
    const text = await navigator.clipboard?.readText?.();
    const normalized = text?.trim() ?? '';
    if (normalized) {
      rememberRecentClipboard(normalized);
      return normalized;
    }
  } catch {
    // Fall back to in-app clipboard tracking and recent selection cache.
  }

  const recentClipboard = getRecentClipboard();
  if (recentClipboard) {
    return recentClipboard;
  }

  const recentSelection = getRecentSelection();
  if (recentSelection) {
    return recentSelection;
  }

  return '';
}

export async function readClipboardTextDirect(): Promise<string> {
  const t = (zhHans: string, en: string) => pickLocalized(zhHans, en);

  if (!navigator.clipboard?.readText) {
    throw new Error(
      t(
        '当前环境不支持读取系统剪贴板。',
        'The current environment does not support reading from the system clipboard.'
      )
    );
  }

  try {
    const text = await navigator.clipboard.readText();
    const normalized = text?.trim() ?? '';
    if (normalized) {
      rememberRecentClipboard(normalized);
    }

    return normalized;
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        throw new Error(
          t(
            '当前环境不允许后台读取系统剪贴板，请保持 RemNote 窗口聚焦并确认已授予剪贴板权限。',
            'Background clipboard reads are not allowed. Keep RemNote focused and ensure clipboard permission is granted.'
          )
        );
      }

      throw new Error(
        t(
          `读取系统剪贴板失败：${error.message || error.name}`,
          `Failed to read system clipboard: ${error.message || error.name}`
        )
      );
    }

    if (error instanceof Error && error.message.trim()) {
      throw new Error(
        t(
          `读取系统剪贴板失败：${error.message.trim()}`,
          `Failed to read system clipboard: ${error.message.trim()}`
        )
      );
    }

    throw new Error(t('读取系统剪贴板失败。', 'Failed to read system clipboard.'));
  }
}

export async function getSelectionOrClipboardText(plugin: RNPlugin): Promise<{
  text: string;
  source: 'selection' | 'clipboard' | 'none';
}> {
  const selectionText = await getCurrentSelectionText(plugin);
  if (selectionText) {
    return { text: selectionText, source: 'selection' };
  }

  const clipboardText = await getClipboardText();
  if (clipboardText) {
    return { text: clipboardText, source: 'clipboard' };
  }

  return { text: '', source: 'none' };
}
