import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';

interface GroupCardProps {
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
  role?: string;
  onPress: () => void;
}

export default function GroupCard({
  name,
  description,
  memberCount = 0,
  role,
  onPress,
}: GroupCardProps) {
  const {isDark, colors} = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: isDark ? colors.shadow : '#0F172A',
        },
      ]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <View
            style={[
              styles.iconContainer,
              {backgroundColor: isDark ? 'rgba(96,165,250,0.15)' : '#DBEAFE'},
            ]}>
            <Icon
              name="account-group"
              size={20}
              color={isDark ? '#60A5FA' : Colors.primary}
            />
          </View>
          {role && (
            <View
              style={[
                styles.roleBadge,
                {
                  backgroundColor: isDark
                    ? 'rgba(37,99,235,0.15)'
                    : '#EFF6FF',
                },
              ]}>
              <Text
                style={[
                  styles.roleText,
                  {color: isDark ? '#60A5FA' : Colors.primary},
                ]}>
                {role}
              </Text>
            </View>
          )}
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
          <View style={styles.memberRow}>
            <Icon name="account-multiple" size={14} color={colors.textTertiary} />
            <Text style={[styles.memberText, {color: colors.textTertiary}]}>
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </Text>
          </View>
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
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  footer: {
    marginTop: Spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  memberText: {
    fontSize: 12,
  },
});
