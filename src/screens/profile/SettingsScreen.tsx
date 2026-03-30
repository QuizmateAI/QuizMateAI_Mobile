import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import SwitchComponent from '../../components/ui/Switch';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import FloatingInput from '../../components/ui/Input';
import ProfileAPI from '../../api/ProfileAPI';

export default function SettingsScreen({navigation}: any) {
  const {isDark, colors, toggleTheme} = useTheme();
  const {user, logout, updateUser} = useAuth();
  const {showToast} = useToast();

  const [editVisible, setEditVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await ProfileAPI.updateProfile({fullName, email});
      if (user) {
        await updateUser({...user, fullName, email});
      }
      showToast('Đã cập nhật hồ sơ!', 'success');
      setEditVisible(false);
    } catch {
      showToast('Không thể cập nhật hồ sơ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showToast('Mật khẩu xác nhận không khớp', 'error');
      return;
    }
    setSaving(true);
    try {
      await ProfileAPI.changePassword({oldPassword, newPassword});
      showToast('Đổi mật khẩu thành công!', 'success');
      setPasswordVisible(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      showToast('Không thể đổi mật khẩu', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>
          Cài đặt
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Appearance */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>
          GIAO DIỆN
        </Text>
        <View
          style={[
            styles.settingGroup,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.settingRow}>
            <Icon
              name={isDark ? 'moon-waning-crescent' : 'white-balance-sunny'}
              size={20}
              color={colors.icon}
            />
            <Text style={[styles.settingLabel, {color: colors.text}]}>
              Chế độ tối
            </Text>
            <SwitchComponent value={isDark} onValueChange={toggleTheme} />
          </View>
        </View>

        {/* Account */}
        <Text style={[styles.sectionTitle, {color: colors.textSecondary}]}>
          TÀI KHOẢN
        </Text>
        <View
          style={[
            styles.settingGroup,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <TouchableOpacity
            onPress={() => setEditVisible(true)}
            style={styles.settingRow}>
            <Icon name="account-outline" size={20} color={colors.icon} />
            <View style={styles.settingContent}>
              <Text style={[styles.settingLabel, {color: colors.text}]}>
                Chỉnh sửa hồ sơ
              </Text>
              <Text style={[styles.settingSub, {color: colors.textSecondary}]}>
                {user?.fullName}
              </Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <View style={[styles.divider, {backgroundColor: colors.border}]} />

          <TouchableOpacity
            onPress={() => setPasswordVisible(true)}
            style={styles.settingRow}>
            <Icon name="lock-outline" size={20} color={colors.icon} />
            <Text style={[styles.settingLabel, {color: colors.text}]}>
              Đổi mật khẩu
            </Text>
            <Icon name="chevron-right" size={20} color={colors.textTertiary} />
          </TouchableOpacity>

          <View style={[styles.divider, {backgroundColor: colors.border}]} />

          <TouchableOpacity
            onPress={() => navigation.navigate('Subscription')}
            style={styles.settingRow}>
            <Icon name="crown-outline" size={20} color="#F59E0B" />
            <Text style={[styles.settingLabel, {color: colors.text}]}>
              Gói đăng ký
            </Text>
            <Icon name="chevron-right" size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          style={[
            styles.logoutBtn,
            {backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : '#FEF2F2'},
          ]}>
          <Icon name="logout" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Profile Dialog */}
      <Dialog
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        title="Chỉnh sửa hồ sơ">
        <View style={styles.dialogForm}>
          <FloatingInput
            label="Full Name"
            value={fullName}
            onChangeText={setFullName}
          />
          <FloatingInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
          />
          <View style={styles.dialogActions}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              onPress={() => setEditVisible(false)}
              fullWidth={false}
              style={{flex: 1}}
            />
            <Button
              title="Save"
              size="md"
              onPress={handleSaveProfile}
              loading={saving}
              fullWidth={false}
              style={{flex: 1}}
            />
          </View>
        </View>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog
        visible={passwordVisible}
        onClose={() => setPasswordVisible(false)}
        title="Đổi mật khẩu">
        <View style={styles.dialogForm}>
          <FloatingInput
            label="Current Password"
            value={oldPassword}
            onChangeText={setOldPassword}
            secureTextEntry
          />
          <FloatingInput
            label="New Password"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />
          <FloatingInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
          <View style={styles.dialogActions}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              onPress={() => setPasswordVisible(false)}
              fullWidth={false}
              style={{flex: 1}}
            />
            <Button
              title="Change"
              size="md"
              onPress={handleChangePassword}
              loading={saving}
              fullWidth={false}
              style={{flex: 1}}
            />
          </View>
        </View>
      </Dialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {padding: Spacing.sm, width: 42},
  headerTitle: {fontSize: 17, fontWeight: '600'},
  scrollContent: {padding: Spacing.lg, paddingBottom: 40},

  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
    letterSpacing: 0.5,
  },

  settingGroup: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    gap: 12,
  },
  settingContent: {flex: 1},
  settingLabel: {flex: 1, fontSize: 14, fontWeight: '500'},
  settingSub: {fontSize: 12, marginTop: 1},
  divider: {height: StyleSheet.hairlineWidth, marginLeft: 48},

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    marginTop: Spacing['2xl'],
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.error,
  },

  dialogForm: {gap: Spacing.md},
  dialogActions: {flexDirection: 'row', gap: 12, marginTop: Spacing.sm},
});
