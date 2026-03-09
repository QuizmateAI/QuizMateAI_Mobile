import React from 'react';
import {View, Text, Switch as RNSwitch, StyleSheet} from 'react-native';
import {Colors} from '../../theme/colors';
import {useTheme} from '../../context/ThemeContext';

interface SwitchProps {
  label?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export default function Switch({
  label,
  value,
  onValueChange,
  disabled,
}: SwitchProps) {
  const {isDark, colors} = useTheme();

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, {color: colors.text}]}>{label}</Text>
      )}
      <RNSwitch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{
          false: isDark ? '#334155' : '#D1D5DB',
          true: Colors.primary,
        }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
});
