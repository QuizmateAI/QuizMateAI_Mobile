import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {Colors} from '../../theme/colors';
import {localizeUiText} from '../../utils/uiText';

interface ActionSheetItem {
  key: string;
  label: string;
  icon: string;
  color?: string;
  destructive?: boolean;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  items: ActionSheetItem[];
  onSelect: (key: string) => void;
}

export default function ActionSheet({
  visible,
  onClose,
  title,
  items,
  onSelect,
}: ActionSheetProps) {
  const {isDark, colors} = useTheme();
  const localizedTitle = title ? localizeUiText(title) : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, {backgroundColor: colors.overlay}]}>
          <TouchableWithoutFeedback>
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              {title && (
                <View
                  style={[
                    styles.titleRow,
                    {borderBottomColor: colors.border},
                  ]}>
                  <Text style={[styles.title, {color: colors.heading}]}>
                    {localizedTitle}
                  </Text>
                </View>
              )}
              {items.map((item, index) => {
                const itemColor = item.destructive
                  ? Colors.error
                  : item.color || colors.text;
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => {
                      onSelect(item.key);
                      onClose();
                    }}
                    activeOpacity={0.6}
                    style={[
                      styles.item,
                      index < items.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}>
                    <Icon name={item.icon} size={20} color={itemColor} />
                    <Text
                      style={[
                        styles.itemLabel,
                        {color: itemColor},
                        item.destructive && styles.destructiveLabel,
                      ]}>
                      {localizeUiText(item.label)}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Cancel button */}
              <TouchableOpacity
                onPress={onClose}
                activeOpacity={0.6}
                style={[
                  styles.cancelBtn,
                  {
                    backgroundColor: isDark
                      ? Colors.dark.surfaceVariant
                      : '#F1F5F9',
                  },
                ]}>
                <Text style={[styles.cancelText, {color: colors.textSecondary}]}>
                  {localizeUiText('Cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing['2xl'],
  },
  sheet: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  titleRow: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    gap: 14,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  destructiveLabel: {
    fontWeight: '600',
  },
  cancelBtn: {
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
