import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {preferencesStore} from '../api/preferencesStore';
import {colorsFor, type ThemeColors} from './tokens';

type ThemeApi = {
  colors: ThemeColors;
  darkMode: boolean;
  setDarkMode: (value: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

const ThemeContext = createContext<ThemeApi | null>(null);

export function useTheme(): ThemeApi {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme requires ThemeProvider');
  }
  return ctx;
}

export function useThemeOptional(): ThemeApi | null {
  return useContext(ThemeContext);
}

type Props = {
  children: React.ReactNode;
  /** When false (splash/landing), keep light chrome for marketing. */
  applyArenaTheme?: boolean;
};

export const ThemeProvider: React.FC<Props> = ({
  children,
  applyArenaTheme = true,
}) => {
  const [darkMode, setDarkModeState] = useState(true);

  const refresh = useCallback(async () => {
    const prefs = await preferencesStore.getLocal();
    setDarkModeState(prefs.darkMode !== false);
  }, []);

  useEffect(() => {
    void refresh();
    return preferencesStore.subscribe(prefs => {
      setDarkModeState(prefs.darkMode !== false);
    });
  }, [refresh]);

  const setDarkMode = useCallback(async (value: boolean) => {
    setDarkModeState(value);
    await preferencesStore.update({darkMode: value});
  }, []);

  const colors = useMemo(() => {
    if (!applyArenaTheme) return colorsFor(false);
    return colorsFor(darkMode);
  }, [applyArenaTheme, darkMode]);

  const value = useMemo<ThemeApi>(
    () => ({
      colors,
      darkMode: applyArenaTheme ? darkMode : false,
      setDarkMode,
      refresh,
    }),
    [colors, darkMode, applyArenaTheme, setDarkMode, refresh],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
