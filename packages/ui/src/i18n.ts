/**
 * Swahili first, English on request. Strings are written in place as pairs,
 * t("Ingia", "Sign in"), so a screen reads in both languages side by side and
 * no key files drift out of date.
 */
import { useSyncExternalStore } from "react";
import { setTextLang } from "@afisa/shared";

export type Lang = "sw" | "en";
export const LANGS: { value: Lang; label: string; short: string }[] = [
  { value: "sw", label: "Kiswahili", short: "SW" },
  { value: "en", label: "English", short: "EN" },
];

const KEY = "afisa.lang";

function read(): Lang {
  try {
    return localStorage.getItem(KEY) === "en" ? "en" : "sw";
  } catch {
    return "sw";
  }
}

let lang: Lang = typeof window === "undefined" ? "sw" : read();
// Catalog and record labels from @afisa/shared follow the same choice.
setTextLang(lang);
const listeners = new Set<() => void>();
if (typeof document !== "undefined") document.documentElement.lang = lang;

export function setLang(next: Lang) {
  lang = next;
  setTextLang(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* private mode: keep it in memory */
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

export function getLang(): Lang {
  return lang;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => lang, () => lang);
}

export type T = (sw: string, en: string) => string;

/** t("Swahili", "English"): the text in the language chosen now. */
export function useT(): T {
  const l = useLang();
  return (sw, en) => (l === "en" ? en : sw);
}

/** For catalog labels shaped { sw, en }. */
export function useLabel(): (label: { sw: string; en: string }) => string {
  const l = useLang();
  return (label) => label[l];
}

/** Dates and numbers follow the language: "18 Nov 2026" in both, months named per language. */
export function locale(l: Lang = lang): string {
  return l === "en" ? "en-GB" : "sw-TZ";
}
