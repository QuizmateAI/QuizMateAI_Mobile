import React from 'react';
import {Image, ImageStyle, StyleProp} from 'react-native';
import {useTheme} from '../context/ThemeContext';

const logoLight = require('../assets/logo_light.png');
const logoDark = require('../assets/logo_dark.png');

interface AppLogoProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function AppLogo({size = 48, style}: AppLogoProps) {
  const {isDark} = useTheme();
  return (
    <Image
      source={isDark ? logoDark : logoLight}
      style={[{width: size, height: size}, style]}
      resizeMode="contain"
    />
  );
}
