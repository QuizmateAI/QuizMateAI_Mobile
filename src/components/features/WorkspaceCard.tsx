import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';

interface WorkspaceCardProps {
  id: number;
  name: string;
  description?: string;
  topicName?: string;
  createdAt?: string;
  colorIndex?: number;
  onPress: () => void;
  onLongPress?: () => void;
  onDotsPress?: () => void;
}

const ACCENT_COLORS = [
  {light: '#059669', dark: '#34D399'},
  {light: '#EA580C', dark: '#FB923C'},
  {light: '#2563EB', dark: '#60A5FA'},
  {light: '#7C3AED', dark: '#A78BFA'},
  {light: '#DB2777', dark: '#F472B6'},
];

export default function WorkspaceCard({
  name,
  description,
  topicName,
  createdAt,
  colorIndex = 0,
  onPress,
  onLongPress,
  onDotsPress,
}: WorkspaceCardProps) {
  const {isDark, colors} = useTheme();
  const accent = ACCENT_COLORS[colorIndex % ACCENT_COLORS.length];
  const accentColor = isDark ? accent.dark : accent.light;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? colors.shadow : '#0F172A',
        },
      ]}>
      <View style={[styles.accentBar, {backgroundColor: accentColor}]} />
      <View style={styles.content}>
        <View style={styles.header}>
          <View
            style={[
              styles.iconContainer,
              {backgroundColor: `${accentColor}15`},
            ]}>
            <Icon name="book-open-variant" size={18} color={accentColor} />
          </View>
          <TouchableOpacity
            onPress={onDotsPress || onLongPress}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
            disabled={!onDotsPress && !onLongPress}>
            <Icon name="dots-vertical" size={18} color={colors.icon} />
          </TouchableOpacity>
        </View>

        <Text
          style={[styles.title, {color: colors.heading}]}
          numberOfLines={2}>
          {name}
        </Text>

        {description ? (
          <Text
            style={[styles.description, {color: colors.textSecondary}]}
            numberOfLines={2}>
            {description}
          </Text>
        ) : null}

        <View style={styles.footer}>
          {topicName ? (
            <View
              style={[
                styles.topicBadge,
                {backgroundColor: `${accentColor}15`},
              ]}>
              <Text style={[styles.topicText, {color: accentColor}]}>
                {topicName}
              </Text>
            </View>
          ) : null}
          {createdAt ? (
            <Text style={[styles.date, {color: colors.textTertiary}]}>
              {new Date(createdAt).toLocaleDateString()}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: Spacing.md,
  },
  accentBar: {
    height: 4,
  },
  content: {
    padding: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  topicBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  topicText: {
    fontSize: 11,
    fontWeight: '600',
  },
  date: {
    fontSize: 11,
  },
});
