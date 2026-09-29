"use client";

import { useEffect, useState } from "react";
import { Icon } from "./ui";

const STORAGE_KEY = "n2s:theme";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    } catch {
      /* private mode — ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle dark mode"
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-2 transition hover:border-border-2 hover:text-text"
    >
      {dark === null ? <span className="h-4 w-4" /> : dark ? Icon.sun() : Icon.moon()}
    </button>
  );
}
