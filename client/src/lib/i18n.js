import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FR_PLACEHOLDERS, FR_TEXT } from './fr';

/**
 * French for the redesigned pages.
 *
 * The original screens translate by walking their rendered text nodes and
 * swapping each against a dictionary. It is not how one would start, but it
 * works, it covers 238 phrases already, and replacing it would mean rewriting
 * every string on every screen at once.
 *
 * So the redesigned pages use the same mechanism and the same dictionary
 * (lib/fr.js), which keeps one source of truth: a phrase cannot be French on
 * the dashboard and English on Explore.
 *
 * The language itself lives in localStorage under `gt_language`, which App.jsx
 * already reads, so both halves of the application agree without either
 * needing to know about the other. A custom event covers the case of both
 * being mounted at once.
 */

export const LANGUAGE_KEY = 'gt_language';
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGES = [
  { id: 'en', label: 'EN', title: 'English' },
  { id: 'fr', label: 'FR', title: 'Français' },
];

/** Broadcast within this tab; `storage` only fires in *other* tabs. */
const CHANGE_EVENT = 'gt:language';

export function getLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY) || DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // A private window can refuse; the choice then lasts for this page only.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: language }));
}

/** The current language, kept in step with every other component and tab. */
export function useLanguage() {
  const [language, setLocal] = useState(getLanguage);

  useEffect(() => {
    const sync = () => setLocal(getLanguage());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const change = useCallback((next) => {
    setLanguage(next);
    setLocal(next);
  }, []);

  return { language, setLanguage: change };
}

const PLACEHOLDER_MARK = 'data-gt-en';

/**
 * Translate every text node beneath `root`, in place.
 *
 * Runs after render, so it must be re-run whenever React replaces the text —
 * which is why the hook below keys on the rendered content as well as the
 * language.
 */
export function translateRoot(root, language) {
  if (!root || language !== 'fr') return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ['SCRIPT', 'STYLE', 'TEXTAREA'].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    const raw = node.nodeValue;
    const core = raw.trim();
    const french = FR_TEXT[core];
    if (!french) return;
    // Whitespace around the phrase is layout, not content, so it is preserved.
    node.nodeValue = raw.replace(core, french);
  });

  root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((element) => {
    // The English original is remembered, so switching back to English does
    // not leave a French placeholder with no way home.
    const original = element.getAttribute(PLACEHOLDER_MARK) || element.getAttribute('placeholder');
    if (!original) return;
    element.setAttribute(PLACEHOLDER_MARK, original);
    const french = FR_PLACEHOLDERS[original] || FR_TEXT[original];
    if (french) element.setAttribute('placeholder', french);
  });

  root.querySelectorAll(`[${PLACEHOLDER_MARK}]`).forEach((element) => {
    if (language !== 'fr') element.setAttribute('placeholder', element.getAttribute(PLACEHOLDER_MARK));
  });
}

/**
 * Apply the current language to a page.
 *
 * Returns a ref to put on the page's outermost element. Switching *to* French
 * translates in place; switching back to English cannot be undone by walking
 * the DOM — the English is gone — so it reloads, which is instant from cache
 * and is what the original implementation does too.
 */
export function useTranslatedPage() {
  const ref = useRef(null);
  const { language } = useLanguage();
  const appliedEnglish = useRef(language !== 'fr');

  useLayoutEffect(() => {
    if (language !== 'fr') {
      // Walking the DOM cannot undo a translation — the English is gone — so
      // returning to English reloads. Instant from cache, and it is what the
      // original screens do too.
      if (!appliedEnglish.current) {
        appliedEnglish.current = true;
        window.location.reload();
      }
      return undefined;
    }

    appliedEnglish.current = false;
    const root = ref.current;
    if (!root) return undefined;

    translateRoot(root, 'fr');

    /* Most of these pages fetch after they mount, so React replaces the
       translated nodes with fresh English ones a moment later — a single pass
       at mount leaves half the screen untranslated. An observer catches every
       later render instead of each page having to declare what it waits for.

       It disconnects around its own work, because translating is itself a
       mutation and would otherwise retrigger the observer forever. */
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        observer.disconnect();
        translateRoot(root, 'fr');
        observer.observe(root, { childList: true, subtree: true, characterData: true });
      });
    });

    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);

  return ref;
}
