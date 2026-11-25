/**
 * The language of on-screen text that comes from this package (record names,
 * list labels, summaries, reminders). The apps keep it in step with their
 * language switch (setTextLang). Official forms (ARDS monthly report, food
 * report) are always built in Swahili: their builders run inside inSwahili().
 */
export type TextLang = "sw" | "en";

let current: TextLang = "sw";

export function setTextLang(l: TextLang) {
  current = l;
}

export function textLang(): TextLang {
  return current;
}

/** L("Swahili", "English"): the text in the current language. */
export function L(sw: string, en: string): string {
  return current === "en" ? en : sw;
}

/** Run `fn` with Swahili text (for official forms), then restore. */
export function inSwahili<T>(fn: () => T): T {
  const prev = current;
  current = "sw";
  try {
    return fn();
  } finally {
    current = prev;
  }
}

/** Run fn with English text, e.g. to pair a Swahili label with its English. */
export function inEnglish<T>(fn: () => T): T {
  const prev = current;
  current = "en";
  try {
    return fn();
  } finally {
    current = prev;
  }
}
