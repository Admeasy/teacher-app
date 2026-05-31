"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
type Resolved = "light" | "dark";

const STORAGE_KEY = "admeasy-theme";

function getSystem(): Resolved {
  if (typeof window === "undefined") return "dark";

  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system";

  const value = localStorage.getItem(STORAGE_KEY);

  if (
    value === "light" ||
    value === "dark" ||
    value === "system"
  ) {
    return value;
  }

  return "system";
}

function applyTheme(resolved: Resolved) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;

  if (resolved === "light") {
    root.classList.add("light");
  } else {
    root.classList.remove("light");
  }

  root.style.colorScheme = resolved;
}

interface ThemeContextType {
  theme: ThemeMode;
  resolved: Resolved;
  setTheme: (theme: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  resolved: "dark",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  const [theme, setThemeState] = useState<ThemeMode>("system");

  const [resolved, setResolved] =
    useState<Resolved>("dark");

  // Hydration-safe init
  useEffect(() => {
    const storedTheme = readStored();

    const resolvedTheme =
      storedTheme === "system"
        ? getSystem()
        : storedTheme;

    setThemeState(storedTheme);
    setResolved(resolvedTheme);

    applyTheme(resolvedTheme);

    setMounted(true);
  }, []);

  // Apply changes
  useEffect(() => {
    if (!mounted) return;

    const resolvedTheme =
      theme === "system"
        ? getSystem()
        : theme;

    setResolved(resolvedTheme);

    applyTheme(resolvedTheme);

    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  // System theme listener
  useEffect(() => {
    if (!mounted || theme !== "system") return;

    const mediaQuery = window.matchMedia(
      "(prefers-color-scheme: light)"
    );

    const handleChange = () => {
      const resolvedTheme: Resolved =
        mediaQuery.matches ? "light" : "dark";

      setResolved(resolvedTheme);

      applyTheme(resolvedTheme);
    };

    mediaQuery.addEventListener(
      "change",
      handleChange
    );

    return () => {
      mediaQuery.removeEventListener(
        "change",
        handleChange
      );
    };
  }, [theme, mounted]);

  const setTheme = useCallback(
    (theme: ThemeMode) => {
      setThemeState(theme);
    },
    []
  );

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const current =
        prev === "system"
          ? getSystem()
          : prev;

      return current === "dark"
        ? "light"
        : "dark";
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolved,
        setTheme,
        toggle,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}