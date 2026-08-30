// Enter-to-submit that does not fight an input method editor.
//
// Ported from StudyDesk's `src/lib/imeSubmit.js`, which shipped in 1.11.1 to
// close GitHub issue #35. LimeLog has never had a CJK bug report, but it has the
// same defect and nobody has ever typed Chinese into it — which is exactly how
// StudyDesk's went unnoticed across every release since 1.5.
//
// A CJK IME uses Enter to *commit the candidate selection*, not to submit. In an
// Android WebView that keydown reaches the React handler before composition
// ends, so `onKeyDown={e => e.key === 'Enter' && handleNameSave()}` fires on the
// keystroke that was meant to choose characters — saving a half-typed romaji or
// pinyin buffer, or nothing at all.
//
// Three signals, because no single one is reliable in an Android WebView:
//
//   1. `nativeEvent.isComposing` — the standard, and correct where it is
//      implemented. React's SyntheticEvent does not surface it, hence
//      nativeEvent.
//   2. `keyCode === 229` — what a WebView reports for a keystroke the IME has
//      swallowed. Predates isComposing and is still what several Android
//      keyboards actually send. A real Enter is 13, so this never false-fires.
//   3. A composition flag we keep ourselves. Some WebView builds have already
//      cleared isComposing by the time keydown is dispatched, which is the whole
//      bug reappearing through the one check that was supposed to catch it.
//      compositionstart/compositionend bracket the session unambiguously.
//
// The flag lives in a WeakSet keyed on the DOM element, not in a ref. That keeps
// this a plain function rather than a hook, so it can be called inside a map or
// a conditional branch without changing hook order at any call site, and entries
// die with the element.

import type React from 'react';

const composing = new WeakSet<Element>();

function isComposing(e: React.KeyboardEvent, el: Element | null): boolean {
  const ne = e.nativeEvent as KeyboardEvent | undefined;
  return Boolean(
    ne?.isComposing ||
    e.keyCode === 229 ||
    ne?.keyCode === 229 ||
    (el && composing.has(el)),
  );
}

/**
 * Props for a text input whose Enter key submits.
 *
 * Spread it: `<input {...enterSubmit(save)} />`. Returns all three handlers
 * together on purpose — a call site cannot take the Enter guard and forget the
 * composition tracking that makes it work.
 *
 * `fn` receives the event, so a caller that needs preventDefault or the value
 * still has it. It is called only for a real, committed Enter.
 *
 * After the IME commits on the first Enter, a second Enter submits. That is the
 * behaviour every native CJK text field has; it is the correct outcome, not a
 * compromise.
 */
export function enterSubmit(fn: (e: React.KeyboardEvent) => void) {
  return {
    onCompositionStart: (e: React.CompositionEvent) => { composing.add(e.currentTarget); },
    onCompositionEnd: (e: React.CompositionEvent) => { composing.delete(e.currentTarget); },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (isComposing(e, e.currentTarget)) return;
      fn(e);
    },
  };
}
