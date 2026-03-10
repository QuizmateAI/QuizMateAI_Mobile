import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius} from '../../theme/spacing';

interface Tab {
  key: string;
  label: string;
  icon?: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function TabBar({tabs, activeTab, onTabChange}: TabBarProps) {
  const {isDark, colors} = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F1F5F9',
          borderColor: colors.border,
        },
      ]}>
      {tabs.map(tab => {
        const isActive = tab.key === activeTab;
        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onTabChange(tab.key)}
            activeOpacity={0.7}
            style={[
              styles.tab,
              isActive && {
                backgroundColor: isDark
                  ? Colors.dark.surface
                  : '#FFFFFF',
                shadowColor: '#000',
                shadowOffset: {width: 0, height: 1},
                shadowOpacity: 0.08,
                shadowRadius: 4,
                elevation: 2,
              },
            ]}>
            <Text
              style={[
                styles.tabText,
                {
                  color: isActive
                    ? isDark
                      ? colors.tabActiveText
                      : colors.tabActiveText
                    : colors.textSecondary,
                  fontWeight: isActive ? '600' : '500',
                },
              ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: BorderRadius.full,
    padding: 4,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 13,
  },
});
