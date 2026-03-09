import React from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import {Colors} from '../../theme/colors';
import {useTheme} from '../../context/ThemeContext';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  fullScreen?: boolean;
  color?: string;
}

export default function LoadingSpinner({
  size = 'large',
  fullScreen = true,
  color,
}: LoadingSpinnerProps) {
  const {colors} = useTheme();

  if (!fullScreen) {
    return (
      <ActivityIndicator
        size={size}
        color={color || Colors.primary}
        style={styles.inline}
      />
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <ActivityIndicator size={size} color={color || Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inline: {
    padding: 20,
  },
});
