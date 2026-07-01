import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Read from localStorage, default to dark
    const stored = localStorage.getItem("salamanda-theme") as Theme | null;
    return stored ?? "dark";
  });

  // Apply theme class to <html> element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
    localStorage.setItem("salamanda-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme };
}
