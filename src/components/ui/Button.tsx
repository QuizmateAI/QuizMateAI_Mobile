import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors} from '../../theme/colors';
import {useTheme} from '../../context/ThemeContext';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {localizeUiText} from '../../utils/uiText';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'lg',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = true,
}: ButtonProps) {
  const {isDark, colors} = useTheme();
  const localizedTitle = localizeUiText(title);

  const getVariantStyles = (): {container: ViewStyle; text: TextStyle} => {
    switch (variant) {
      case 'primary':
        return {
          container: {
            backgroundColor: Colors.secondary,
          },
          text: {color: '#FFFFFF'},
        };
      case 'secondary':
        return {
          container: {
            backgroundColor: isDark
              ? Colors.dark.surfaceVariant
              : Colors.primaryLight,
          },
          text: {color: Colors.primary},
        };
      case 'outline':
        return {
          container: {
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderColor: colors.border,
          },
          text: {color: colors.text},
        };
      case 'ghost':
        return {
          container: {backgroundColor: 'transparent'},
          text: {color: colors.text},
        };
      case 'destructive':
        return {
          container: {backgroundColor: Colors.error},
          text: {color: '#FFFFFF'},
        };
      default:
        return {
          container: {backgroundColor: Colors.secondary},
          text: {color: '#FFFFFF'},
        };
    }
  };

  const getSizeStyles = (): {container: ViewStyle; text: TextStyle} => {
    switch (size) {
      case 'sm':
        return {
          container: {height: 36, paddingHorizontal: Spacing.md},
          text: {fontSize: 13},
        };
      case 'md':
        return {
          container: {height: 44, paddingHorizontal: Spacing.base},
          text: {fontSize: 14},
        };
      case 'lg':
        return {
          container: {height: 52, paddingHorizontal: Spacing.xl},
          text: {fontSize: 15},
        };
    }
  };

  const variantStyles = getVariantStyles();
  const sizeStyles = getSizeStyles();
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        styles.base,
        variantStyles.container,
        sizeStyles.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variantStyles.text.color as string}
        />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Icon
              name={icon}
              size={18}
              color={variantStyles.text.color as string}
              style={styles.iconLeft}
            />
          )}
          <Text
            style={[
              styles.text,
              variantStyles.text,
              sizeStyles.text,
              textStyle,
            ]}>
            {localizedTitle}
          </Text>
          {icon && iconPosition === 'right' && (
            <Icon
              name={icon}
              size={18}
              color={variantStyles.text.color as string}
              style={styles.iconRight}
            />
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontWeight: '600',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
