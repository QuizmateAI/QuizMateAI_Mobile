import React from 'react';
import {View, Text, StyleSheet, ViewStyle} from 'react-native';
import {Colors} from '../../theme/colors';
import {useTheme} from '../../context/ThemeContext';

type BadgeVariant = 'default' | 'success' | 'error' | 'warning' | 'info' | 'outline';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

export default function Badge({
  label,
  variant = 'default',
  style,
  size = 'md',
}: BadgeProps) {
  const {isDark} = useTheme();

  const getColors = () => {
    const map: Record<BadgeVariant, {bg: string; text: string}> = {
      default: {
        bg: isDark ? '#1E293B' : '#F1F5F9',
        text: isDark ? '#94A3B8' : '#475569',
      },
      success: {
        bg: isDark ? 'rgba(16,185,129,0.15)' : '#D1FAE5',
        text: isDark ? '#34D399' : '#059669',
      },
      error: {
        bg: isDark ? 'rgba(239,68,68,0.15)' : '#FEE2E2',
        text: isDark ? '#F87171' : '#DC2626',
      },
      warning: {
        bg: isDark ? 'rgba(245,158,11,0.15)' : '#FEF3C7',
        text: isDark ? '#FBBF24' : '#D97706',
      },
      info: {
        bg: isDark ? 'rgba(59,130,246,0.15)' : '#DBEAFE',
        text: isDark ? '#60A5FA' : '#2563EB',
      },
      outline: {
        bg: 'transparent',
        text: isDark ? '#94A3B8' : '#64748B',
      },
    };
    return map[variant];
  };

  const c = getColors();

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        {
          backgroundColor: c.bg,
          borderColor: variant === 'outline' ? c.text : 'transparent',
          borderWidth: variant === 'outline' ? 1 : 0,
        },
        style,
      ]}>
      <Text
        style={[
          styles.text,
          size === 'sm' && styles.textSm,
          {color: c.text},
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 10,
  },
});
