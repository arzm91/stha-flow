import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

const GLOBAL_KEY = "sthapc:theme";
const userKey = (uid: string) => `sthapc:theme:${uid}`;

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(GLOBAL_KEY);
  return v === "light" ? "light" : "dark";
}

function applyClass(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitial);

  // Load per-user override on auth changes
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      if (!uid) return;
      const v = window.localStorage.getItem(userKey(uid));
      if (mounted && (v === "light" || v === "dark")) {
        setThemeState(v);
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
        load();
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    applyClass(theme);
  }, [theme]);

  const setTheme = (t: ThemeMode) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(GLOBAL_KEY, t);
      supabase.auth.getSession().then(({ data }) => {
        const uid = data.session?.user.id;
        if (uid) window.localStorage.setItem(userKey(uid), t);
      });
    } catch {
      /* noop */
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
