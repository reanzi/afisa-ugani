import { useEffect, useSyncExternalStore } from "react";

/** "system": follow the phone or computer setting (the default); "auto": by the clock. */
export type ThemeChoice = "system" | "auto" | "shambani" | "usiku";
export type Theme = "shambani" | "usiku";

const KEY = "afisa.theme";

/** Night runs 18:30–06:00 local time. */
export function themeForTime(date = new Date()): Theme {
  const minutes = date.getHours() * 60 + date.getMinutes();
  return minutes >= 18 * 60 + 30 || minutes < 6 * 60 ? "usiku" : "shambani";
}

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "shambani" || v === "usiku" || v === "auto" ? v : "system";
  } catch {
    return "system";
  }
}

const darkQuery = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null);
const systemTheme = (): Theme => (darkQuery()?.matches ? "usiku" : "shambani");

// One store for the whole app, so every component sees the same theme.
let choice: ThemeChoice = typeof window === "undefined" ? "system" : readChoice();
let clockTheme: Theme = themeForTime();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const resolve = (): Theme => (choice === "system" ? systemTheme() : choice === "auto" ? clockTheme : choice);
let snapshot = { choice, theme: resolve() };

function refresh() {
  const theme = resolve();
  if (snapshot.choice !== choice || snapshot.theme !== theme) {
    snapshot = { choice, theme };
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    const id = window.setInterval(() => {
      clockTheme = themeForTime();
      refresh();
    }, 60_000);
    (subscribe as { timer?: number }).timer = id;
    darkQuery()?.addEventListener("change", refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.clearInterval((subscribe as { timer?: number }).timer);
      darkQuery()?.removeEventListener("change", refresh);
    }
  };
}

export function setThemeChoice(next: ThemeChoice) {
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* private mode: keep it in memory */
  }
  choice = next;
  clockTheme = themeForTime();
  refresh();
}

/** Current theme; also applies it to <html data-theme> and the browser bar colour. */
export function useTheme() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", state.theme === "usiku" ? "#0f1813" : "#eef1ec");
  }, [state.theme]);
  return { theme: state.theme, choice: state.choice, setChoice: setThemeChoice };
}
