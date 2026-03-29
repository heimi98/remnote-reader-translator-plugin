import { useEffect, useState } from 'react';

export type UiTheme = 'light' | 'dark';

function getThemeFromDom(): UiTheme | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const nodes = [document.documentElement, document.body].filter(
    (node): node is HTMLElement => Boolean(node)
  );

  for (const node of nodes) {
    const classList = node.classList;
    const dataTheme =
      node.getAttribute('data-theme') ||
      node.getAttribute('data-color-mode') ||
      node.getAttribute('data-color-scheme');

    if (classList.contains('dark') || classList.contains('theme-dark') || classList.contains('dark-theme')) {
      return 'dark';
    }

    if (
      classList.contains('light') ||
      classList.contains('theme-light') ||
      classList.contains('light-theme')
    ) {
      return 'light';
    }

    if (dataTheme === 'dark') {
      return 'dark';
    }

    if (dataTheme === 'light') {
      return 'light';
    }
  }

  return null;
}

function detectTheme(): UiTheme {
  const fromDom = getThemeFromDom();
  if (fromDom) {
    return fromDom;
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

export function useUiTheme(): UiTheme {
  const [theme, setTheme] = useState<UiTheme>(() => detectTheme());

  useEffect(() => {
    const syncTheme = () => {
      setTheme((current) => {
        const next = detectTheme();
        return current === next ? current : next;
      });
    };

    syncTheme();

    const observer =
      typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
        ? new MutationObserver(syncTheme)
        : null;

    if (observer && typeof document !== 'undefined') {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
          'class',
          'data-theme',
          'data-color-mode',
          'data-color-scheme',
        ],
      });

      if (document.body) {
        observer.observe(document.body, {
          attributes: true,
          attributeFilter: [
            'class',
            'data-theme',
            'data-color-mode',
            'data-color-scheme',
          ],
        });
      }
    }

    const mediaQuery =
      typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : null;

    const onMediaQueryChange = () => syncTheme();
    mediaQuery?.addEventListener?.('change', onMediaQueryChange);

    const intervalId =
      typeof window !== 'undefined' ? window.setInterval(syncTheme, 1500) : undefined;

    return () => {
      observer?.disconnect();
      mediaQuery?.removeEventListener?.('change', onMediaQueryChange);

      if (typeof intervalId === 'number') {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return theme;
}
