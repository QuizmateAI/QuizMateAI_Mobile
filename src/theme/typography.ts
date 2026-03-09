import {Platform} from 'react-native';

const fontFamily = Platform.select({
  ios: 'Poppins',
  android: 'Poppins',
  default: 'System',
});

export const Typography = {
  fontFamily: {
    regular: `${fontFamily}-Regular`,
    medium: `${fontFamily}-Medium`,
    semiBold: `${fontFamily}-SemiBold`,
    bold: `${fontFamily}-Bold`,
    light: `${fontFamily}-Light`,
  },

  size: {
    xs: 10,
    sm: 12,
    md: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
  },

  lineHeight: {
    xs: 14,
    sm: 16,
    md: 20,
    base: 24,
    lg: 28,
    xl: 28,
    '2xl': 32,
    '3xl': 36,
    '4xl': 40,
  },

  weight: {
    light: '300' as const,
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },
} as const;
