import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { darkPalette, lightPalette, Palette } from './palettes';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeCtx {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  isDark: boolean;
  colors: Palette;
}

const Ctx = createContext<ThemeCtx>({
  mode: 'system',
  setMode: () => {},
  isDark: false,
  colors: lightPalette,
});

let overrideMode: ThemeMode = 'system';

/** Imperatively set the theme before/without React state (used by Settings store hydration). */
export function setThemeOverride(m: ThemeMode) {
  overrideMode = m;
}

export function getThemeOverride(): ThemeMode {
  return overrideMode;
}

export function ThemeProvider({
  mode,
  onModeChange,
  children,
}: {
  mode: ThemeMode;
  onModeChange?: (m: ThemeMode) => void;
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const value = useMemo<ThemeCtx>(() => {
    const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
    return {
      mode,
      setMode: onModeChange ?? (() => {}),
      isDark,
      colors: isDark ? darkPalette : lightPalette,
    };
  }, [mode, system, onModeChange]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
