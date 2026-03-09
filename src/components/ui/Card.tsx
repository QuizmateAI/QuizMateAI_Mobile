import React from 'react';
import {View, Text, StyleSheet, ViewStyle, TextStyle} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {BorderRadius, Spacing} from '../../theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function Card({children, style, noPadding}: CardProps) {
  const {isDark, colors} = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? colors.shadow : '#0F172A',
        },
        !noPadding && styles.cardPadding,
        style,
      ]}>
      {children}
    </View>
  );
}

export function CardHeader({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.cardHeader, style]}>{children}</View>;
}

export function CardTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const {colors} = useTheme();
  return (
    <Text style={[styles.cardTitle, {color: colors.heading}, style]}>
      {children}
    </Text>
  );
}

export function CardDescription({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const {colors} = useTheme();
  return (
    <Text
      style={[styles.cardDescription, {color: colors.textSecondary}, style]}>
      {children}
    </Text>
  );
}

export function CardContent({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.cardContent, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardPadding: {
    padding: Spacing.base,
  },
  cardHeader: {
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardDescription: {
    fontSize: 13,
    marginTop: 4,
  },
  cardContent: {
    marginTop: Spacing.sm,
  },
});
