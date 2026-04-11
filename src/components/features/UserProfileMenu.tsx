import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Modal} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {Colors} from '../../theme/colors';
import Avatar from '../ui/Avatar';
import {BorderRadius, Spacing} from '../../theme/spacing';

interface UserProfileMenuProps {
  visible: boolean;
  onClose: () => void;
  onNavigate: (screen: string) => void;
}

export default function UserProfileMenu({
  visible,
  onClose,
  onNavigate,
}: UserProfileMenuProps) {
  const {isDark, colors} = useTheme();
  const {user, logout} = useAuth();

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          <View style={styles.handle} />

          {/* User Info */}
          <View style={styles.userSection}>
            <Avatar
              uri={user?.avatarUrl}
              name={user?.fullName}
              size={56}
            />
            <View style={styles.userInfo}>
              <Text style={[styles.userName, {color: colors.heading}]}>
                {user?.fullName}
              </Text>
              <Text style={[styles.userEmail, {color: colors.textSecondary}]}>
                {user?.email}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={22} color={colors.icon} />
            </TouchableOpacity>
          </View>

          {/* Menu Items */}
          <View style={styles.menuItems}>
            <MenuItem
              icon="account-outline"
              label="Quản lý tài khoản"
              onPress={() => {
                onClose();
                onNavigate('ProfileMain');
              }}
              colors={colors}
            />
            <MenuItem
              icon="crown-outline"
              label="Gói đăng ký"
              onPress={() => {
                onClose();
                onNavigate('Subscription');
              }}
              colors={colors}
            />
            <MenuItem
              icon="cog-outline"
              label="Cài đặt"
              onPress={() => {
                onClose();
                onNavigate('Settings');
              }}
              colors={colors}
            />
          </View>

          {/* Logout */}
          <TouchableOpacity
            onPress={handleLogout}
            style={[
              styles.logoutBtn,
              {backgroundColor: isDark ? Colors.dark.surfaceVariant : '#F3F4F6'},
            ]}>
            <Icon name="logout" size={20} color={Colors.error} />
            <Text style={[styles.logoutText, {color: Colors.error}]}>
              Đăng xuất
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  colors,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.6}
      style={styles.menuItem}>
      <Icon name={icon} size={22} color={colors.icon} />
      <Text style={[styles.menuLabel, {color: colors.text}]}>{label}</Text>
      <Icon name="chevron-right" size={20} color={colors.textTertiary} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  userInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
  },
  userEmail: {
    fontSize: 13,
    marginTop: 2,
  },
  menuItems: {
    marginBottom: Spacing.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  menuLabel: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
