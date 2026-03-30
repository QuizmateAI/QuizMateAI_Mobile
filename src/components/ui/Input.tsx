import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors} from '../../theme/colors';
import {useTheme} from '../../context/ThemeContext';
import {BorderRadius} from '../../theme/spacing';
import {localizeUiText} from '../../utils/uiText';

interface FloatingInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  showSecureToggle?: boolean;
  onToggleSecure?: () => void;
}

export default function FloatingInput({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry,
  showSecureToggle,
  onToggleSecure,
  ...rest
}: FloatingInputProps) {
  const {isDark, colors} = useTheme();
  const localizedLabel = localizeUiText(label);
  const [isFocused, setIsFocused] = useState(false);
  const animatedValue = useRef(
    new Animated.Value(value ? 1 : 0),
  ).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!value) {
      Animated.timing(animatedValue, {
        toValue: 0,
        duration: 150,
        useNativeDriver: false,
      }).start();
    }
  };

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [animatedValue, value]);

  const labelTop = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 6],
  });

  const labelSize = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 11],
  });

  const borderColor = error
    ? Colors.error
    : isFocused
    ? Colors.secondary
    : colors.border;

  const labelColor = error
    ? Colors.error
    : isFocused
    ? Colors.secondary
    : colors.textTertiary;

  return (
    <View>
      <View
        style={[
          styles.container,
          {
            borderColor,
            backgroundColor: isDark
              ? Colors.dark.surfaceVariant
              : '#FFFFFF',
          },
        ]}>
        <Animated.Text
          style={[styles.label, {top: labelTop, fontSize: labelSize, color: labelColor}]}>
          {localizedLabel}
        </Animated.Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry}
          style={[
            styles.input,
            {color: colors.text},
          ]}
          placeholderTextColor={colors.placeholder}
          {...rest}
        />
        {showSecureToggle && (
          <TouchableOpacity
            onPress={onToggleSecure}
            style={styles.toggleBtn}
            hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
            <Icon
              name={secureTextEntry ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.icon}
            />
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  label: {
    position: 'absolute',
    left: 14,
    fontWeight: '400',
  },
  input: {
    fontSize: 14,
    fontWeight: '400',
    paddingTop: 14,
    paddingBottom: 4,
    paddingRight: 40,
  },
  toggleBtn: {
    position: 'absolute',
    right: 14,
    top: 18,
  },
  errorText: {
    color: Colors.error,
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
});
