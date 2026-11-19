"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

// Light or dark. The page follows the person's system setting until they press
// this; then the choice is kept in this browser (the word "light" or "dark",
// read back by ThemeScript in scripts.tsx). The icon is picked by CSS, so it is
// right even before this script runs.
function isDarkNow(): boolean {
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "dark") return true;
  if (chosen === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(isDarkNow());
  }, []);

  function toggle() {
    const next = isDarkNow() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage can be blocked. The choice then lasts until the page closes.
    }
    setIsDark(next === "dark");
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label="Dark mode"
      aria-pressed={isDark ?? undefined}
    >
      <MoonIcon className="icon-moon" />
      <SunIcon className="icon-sun" />
    </button>
  );
}
