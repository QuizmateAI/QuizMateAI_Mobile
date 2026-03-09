import {MD3LightTheme, MD3DarkTheme} from 'react-native-paper';
import {Colors} from './colors';

export const LightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: Colors.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: Colors.primaryLight,
    secondary: Colors.secondary,
    background: Colors.light.background,
    surface: Colors.light.surface,
    surfaceVariant: Colors.light.surfaceVariant,
    onSurface: Colors.light.text,
    onSurfaceVariant: Colors.light.textSecondary,
    outline: Colors.light.border,
    error: Colors.error,
  },
};

export const DarkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: Colors.primary,
    onPrimary: '#FFFFFF',
    primaryContainer: '#1E3A5F',
    secondary: Colors.secondary,
    background: Colors.dark.background,
    surface: Colors.dark.surface,
    surfaceVariant: Colors.dark.surfaceVariant,
    onSurface: Colors.dark.text,
    onSurfaceVariant: Colors.dark.textSecondary,
    outline: Colors.dark.border,
    error: Colors.error,
  },
};
