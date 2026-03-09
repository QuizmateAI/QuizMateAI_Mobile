import React, {createContext, useContext, useState, useEffect, useCallback} from 'react';
import {useColorScheme, StatusBar} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {Colors} from '../theme/colors';

type ThemeMode = 'light' | 'dark' | 'system';

interface ColorScheme {
  background: string;
  backgroundSecondary: string;
  surface: string;
  surfaceVariant: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  heading: string;
  border: string;
  borderLight: string;
  divider: string;
  icon: string;
  placeholder: string;
  overlay: string;
  shadow: string;
  tabActive: string;
  tabActiveText: string;
  cardGreen: string;
  cardOrange: string;
  cardBlue: string;
  statusBar: 'dark-content' | 'light-content';
}

interface ThemeContextType {
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  colors: ColorScheme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => {},
  colors: Colors.light as ColorScheme,
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = '@quizmate_theme';

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(stored => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeModeState(stored);
      }
    });
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  }, []);

  const isDark =
    themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const toggleTheme = useCallback(() => {
    setThemeMode(isDark ? 'light' : 'dark');
  }, [isDark, setThemeMode]);

  const colors: ColorScheme = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider
      value={{isDark, themeMode, setThemeMode, colors, toggleTheme}}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
