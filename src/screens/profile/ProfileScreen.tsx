import React, {useState, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,

} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useFocusEffect} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {launchImageLibrary} from 'react-native-image-picker';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import FloatingInput from '../../components/ui/Input';
import {Card} from '../../components/ui/Card';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ProfileAPI from '../../api/ProfileAPI';
import ManagementSystemAPI from '../../api/ManagementSystemAPI';
import {
  EMPTY_CREDIT_SUMMARY,
  formatCredits,
  formatCreditDateTime,
  formatPlanDate,
  getCreditTransactionActivity,
  getCreditTransactionIcon,
  getCreditTransactionSourceLabel,
  getCurrentPlanName,
  getCurrentPlanSubtitle,
} from '../../utils/accountSummary';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

export default function ProfileScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const {user, updateUser} = useAuth();
  const {showToast} = useToast();
  const [profile, setProfile] = useState<any>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Edit profile state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const parsedBirthday = useMemo(() => {
    const now = new Date();
    if (!editBirthday) return {day: 1, month: 1, year: 2000};
    const d = new Date(editBirthday);
    if (isNaN(d.getTime())) return {day: 1, month: 1, year: 2000};
    return {day: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear()};
  }, [editBirthday]);

  const [pickerDay, setPickerDay] = useState(parsedBirthday.day);
  const [pickerMonth, setPickerMonth] = useState(parsedBirthday.month);
  const [pickerYear, setPickerYear] = useState(parsedBirthday.year);

  const openDatePicker = () => {
    setPickerDay(parsedBirthday.day);
    setPickerMonth(parsedBirthday.month);
    setPickerYear(parsedBirthday.year);
    setShowDatePicker(true);
  };

  const confirmDatePicker = () => {
    const dd = String(pickerDay).padStart(2, '0');
    const mm = String(pickerMonth).padStart(2, '0');
    setEditBirthday(`${pickerYear}-${mm}-${dd}`);
    setShowDatePicker(false);
  };

  const DAYS = Array.from({length: 31}, (_, i) => i + 1);
  const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
                  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({length: 100}, (_, i) => currentYear - i);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [creditSummary, setCreditSummary] = useState(EMPTY_CREDIT_SUMMARY);
  const [creditTransactions, setCreditTransactions] = useState<any[]>([]);
  const [loadingAccountSummary, setLoadingAccountSummary] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const res = await ProfileAPI.getProfile();
      setProfile(res.data);
      setEditName(res.data?.fullName || '');
      setEditBirthday(res.data?.birthday || '');
    } catch {
      setProfile({
        fullName: user?.fullName || '',
        username: user?.username || '',
        email: user?.email || '',
        avatarUrl: user?.avatarUrl || null,
        birthday: '',
        badges: [],
      });
      setEditName(user?.fullName || '');
      setEditBirthday('');
      showToast('Không thể tải hồ sơ', 'error');
    }
  }, [showToast, user]);

  const loadAccountSummary = useCallback(async () => {
    setLoadingAccountSummary(true);

    const [planResult, creditResult, transactionResult] =
      await Promise.allSettled([
        ManagementSystemAPI.getCurrentUserPlan(),
        ManagementSystemAPI.getMyWallet(),
        ManagementSystemAPI.getMyWalletTransactions(0, 6),
      ]);

    setCurrentPlan(
      planResult.status === 'fulfilled' ? planResult.value.data : null,
    );
    setCreditSummary(
      creditResult.status === 'fulfilled'
        ? creditResult.value.data
        : EMPTY_CREDIT_SUMMARY,
    );
    setCreditTransactions(
      transactionResult.status === 'fulfilled' ? transactionResult.value.data : [],
    );
    setLoadingAccountSummary(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const refreshProfileScreen = async () => {
        await Promise.allSettled([loadProfile(), loadAccountSummary()]);
      };

      if (active) {
        refreshProfileScreen();
      }

      return () => {
        active = false;
      };
    }, [loadAccountSummary, loadProfile]),
  );

  /* ──── Avatar Upload ──── */
  const handleAvatarPress = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.8,
      });

      if (result.didCancel || !result.assets?.[0]) {
        return;
      }

      const asset = result.assets[0];
      if (!asset.uri) {return;}

      setUploadingAvatar(true);

      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: asset.type || 'image/jpeg',
        name: asset.fileName || 'avatar.jpg',
      } as any);

      try {
        const res = await ProfileAPI.uploadAvatar(formData);
        const newUrl = res.data?.avatarUrl || asset.uri;
        setProfile((prev: any) => ({...prev, avatarUrl: newUrl}));
        if (user) {
          await updateUser({...user, avatarUrl: newUrl});
        }
        showToast('Đã cập nhật ảnh đại diện!', 'success');
      } catch {
        showToast('Không thể tải ảnh đại diện lên', 'error');
      }
    } catch (err: any) {
      showToast('Không thể chọn ảnh', 'error');
    } finally {
      setUploadingAvatar(false);
    }
  }, [user, updateUser, showToast]);

  /* ──── Save Profile ──── */
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      showToast('Tên không được để trống', 'warning');
      return;
    }
    setSaving(true);
    try {
      await ProfileAPI.updateProfile({fullName: editName, birthday: editBirthday});
      setProfile((prev: any) => ({
        ...prev,
        fullName: editName,
        birthday: editBirthday,
      }));
      if (user) {
        await updateUser({...user, fullName: editName});
      }
      showToast('Đã cập nhật hồ sơ!', 'success');
    } catch {
      // Mock: update locally anyway
      setProfile((prev: any) => ({
        ...prev,
        fullName: editName,
        birthday: editBirthday,
      }));
      if (user) {
        await updateUser({...user, fullName: editName});
      }
      showToast('Đã cập nhật hồ sơ!', 'success');
    } finally {
      setSaving(false);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    setEditName(profile?.fullName || '');
    setEditBirthday(profile?.birthday || '');
    setIsEditing(false);
  };

  const currentPlanName = loadingAccountSummary
    ? 'Đang tải...'
    : getCurrentPlanName(currentPlan);
  const currentPlanSubtitle = loadingAccountSummary
    ? 'Đang cập nhật thông tin gói'
    : getCurrentPlanSubtitle(currentPlan);
  const creditExpiry = formatPlanDate(creditSummary.planCreditExpiresAt);

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
        <Text style={[styles.headerTitle, {color: colors.heading}]}>
          Hồ sơ
        </Text>
        <View style={styles.headerRight}>
          {!isEditing && (
            <TouchableOpacity
              onPress={() => setIsEditing(true)}
              style={styles.editBtn}>
              <Icon name="pencil-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.settingsBtn}>
            <Icon name="cog-outline" size={22} color={colors.icon} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Identity Card */}
        <Card style={styles.identityCard}>
          <View style={styles.identityTop}>
            {/* Avatar with camera overlay */}
            <TouchableOpacity
              onPress={handleAvatarPress}
              activeOpacity={0.7}
              style={styles.avatarWrap}>
              <Avatar
                uri={profile?.avatarUrl || user?.avatarUrl}
                name={profile?.fullName || user?.fullName}
                size={80}
              />
              <View
                style={[
                  styles.cameraBadge,
                  {
                    backgroundColor: Colors.primary,
                    borderColor: colors.surface,
                  },
                ]}>
                {uploadingAvatar ? (
                  <ActivityIndicator size={12} color="#FFF" />
                ) : (
                  <Icon name="camera" size={14} color="#FFF" />
                )}
              </View>
            </TouchableOpacity>

            {/* User info */}
            <View style={styles.identityInfo}>
              {isEditing ? (
                <View style={styles.editFields}>
                  <FloatingInput
                    label="Full Name"
                    value={editName}
                    onChangeText={setEditName}
                  />
                  <TouchableOpacity
                    onPress={openDatePicker}
                    style={[
                      styles.datePickerBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: isDark ? Colors.dark.surfaceVariant : '#FFFFFF',
                      },
                    ]}>
                    <Text style={[styles.datePickerLabel, {color: colors.textTertiary}]}>
                      Ngày sinh
                    </Text>
                    <Text style={[styles.datePickerValue, {color: editBirthday ? colors.text : colors.placeholder}]}>
                      {editBirthday
                        ? new Date(editBirthday).toLocaleDateString('vi-VN', {day: '2-digit', month: '2-digit', year: 'numeric'})
                        : 'Chọn ngày sinh'}
                    </Text>
                    <Icon name="calendar-outline" size={20} color={colors.icon} style={styles.datePickerIcon} />
                  </TouchableOpacity>

                  <Modal visible={showDatePicker} transparent animationType="slide">
                    <TouchableOpacity
                      style={styles.pickerOverlay}
                      activeOpacity={1}
                      onPress={() => setShowDatePicker(false)}
                    />
                    <View style={[styles.pickerSheet, {backgroundColor: colors.surface}]}>
                      <View style={styles.pickerHeader}>
                        <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                          <Text style={[styles.pickerHeaderBtn, {color: colors.textSecondary}]}>Huỷ</Text>
                        </TouchableOpacity>
                        <Text style={[styles.pickerTitle, {color: colors.heading}]}>Chọn ngày sinh</Text>
                        <TouchableOpacity onPress={confirmDatePicker}>
                          <Text style={[styles.pickerHeaderBtn, {color: Colors.primary, fontWeight: '700'}]}>Xong</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.pickerColumns}>
                        {/* Ngày */}
                        <View style={styles.pickerCol}>
                          <Text style={[styles.pickerColLabel, {color: colors.textTertiary}]}>Ngày</Text>
                          <ScrollView showsVerticalScrollIndicator={false} style={styles.pickerScroll}>
                            {DAYS.map(d => (
                              <TouchableOpacity
                                key={d}
                                onPress={() => setPickerDay(d)}
                                style={[styles.pickerItem, pickerDay === d && {backgroundColor: Colors.primary + '20'}]}>
                                <Text style={[styles.pickerItemText, {color: colors.text}, pickerDay === d && {color: Colors.primary, fontWeight: '700'}]}>
                                  {String(d).padStart(2, '0')}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                        {/* Tháng */}
                        <View style={[styles.pickerCol, {flex: 2}]}>
                          <Text style={[styles.pickerColLabel, {color: colors.textTertiary}]}>Tháng</Text>
                          <ScrollView showsVerticalScrollIndicator={false} style={styles.pickerScroll}>
                            {MONTHS.map((m, idx) => (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => setPickerMonth(idx + 1)}
                                style={[styles.pickerItem, pickerMonth === idx + 1 && {backgroundColor: Colors.primary + '20'}]}>
                                <Text style={[styles.pickerItemText, {color: colors.text}, pickerMonth === idx + 1 && {color: Colors.primary, fontWeight: '700'}]}>
                                  {m}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                        {/* Năm */}
                        <View style={styles.pickerCol}>
                          <Text style={[styles.pickerColLabel, {color: colors.textTertiary}]}>Năm</Text>
                          <ScrollView showsVerticalScrollIndicator={false} style={styles.pickerScroll}>
                            {YEARS.map(y => (
                              <TouchableOpacity
                                key={y}
                                onPress={() => setPickerYear(y)}
                                style={[styles.pickerItem, pickerYear === y && {backgroundColor: Colors.primary + '20'}]}>
                                <Text style={[styles.pickerItemText, {color: colors.text}, pickerYear === y && {color: Colors.primary, fontWeight: '700'}]}>
                                  {y}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      </View>
                    </View>
                  </Modal>
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      onPress={handleCancelEdit}
                      style={[
                        styles.editActionBtn,
                        {
                          backgroundColor: isDark
                            ? 'rgba(239,68,68,0.1)'
                            : '#FEF2F2',
                        },
                      ]}>
                      <Icon name="close" size={18} color="#EF4444" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveProfile}
                      disabled={saving}
                      style={[
                        styles.editActionBtn,
                        {
                          backgroundColor: isDark
                            ? 'rgba(16,185,129,0.1)'
                            : '#ECFDF5',
                        },
                      ]}>
                      {saving ? (
                        <ActivityIndicator size={16} color="#10B981" />
                      ) : (
                        <Icon name="check" size={18} color="#10B981" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <>
                  <Text style={[styles.fullName, {color: colors.heading}]}>
                    {profile?.fullName || user?.fullName}
                  </Text>
                  <Text
                    style={[styles.username, {color: colors.textSecondary}]}>
                    @{profile?.username || user?.username}
                  </Text>
                  <Text
                    style={[styles.email, {color: colors.textTertiary}]}>
                    {profile?.email || user?.email}
                  </Text>
                  {profile?.birthday && (
                    <View style={styles.birthdayRow}>
                      <Icon
                        name="cake-variant"
                        size={14}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.birthdayText,
                          {color: colors.textTertiary},
                        ]}>
                        {profile.birthday}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>

        </Card>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Gói và credit
        </Text>
        <View style={styles.accountSummaryGrid}>
          {/* Plan card — full width, horizontal */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Subscription')}
            style={[
              styles.planCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <View
              style={[
                styles.accountSummaryIcon,
                {
                  backgroundColor: isDark
                    ? 'rgba(245,158,11,0.14)'
                    : '#FEF3C7',
                },
              ]}>
              <Icon
                name="crown-outline"
                size={20}
                color={isDark ? '#FBBF24' : '#D97706'}
              />
            </View>
            <View style={styles.planCardContent}>
              <Text style={[styles.accountSummaryLabel, {color: colors.textTertiary}]}>
                Gói hiện tại
              </Text>
              <Text style={[styles.accountSummaryValue, {color: colors.heading}]}>
                {currentPlanName}
              </Text>
              <Text style={[styles.accountSummaryHint, {color: colors.textSecondary}]}>
                {currentPlanSubtitle}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Credit card — full width */}
          <View
            style={[
              styles.accountSummaryCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.accountSummaryTop}>
              <View style={styles.creditHeaderLeft}>
                <View
                  style={[
                    styles.accountSummaryIcon,
                    {
                      backgroundColor: isDark
                        ? 'rgba(37,99,235,0.18)'
                        : '#DBEAFE',
                    },
                  ]}>
                  <Icon
                    name="lightning-bolt-circle"
                    size={20}
                    color={isDark ? '#93C5FD' : Colors.primary}
                  />
                </View>
                <Text style={[styles.accountSummaryLabel, {color: colors.textTertiary, marginBottom: 0}]}>
                  Số dư credit
                </Text>
              </View>
            </View>
            <View style={styles.creditValueRow}>
              <Text style={[styles.creditPrimaryValue, {color: colors.heading}]}>
                {loadingAccountSummary
                  ? '...'
                  : formatCredits(creditSummary.totalAvailableCredits)}
              </Text>
              <Text style={[styles.creditPrimaryUnit, {color: colors.textSecondary}]}>
                credit
              </Text>
            </View>
            <View style={styles.creditBreakdownList}>
              <View
                style={[
                  styles.creditBreakdownCard,
                  {
                    backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                    borderColor: colors.border,
                  },
                ]}>
                <View style={styles.creditBreakdownHeader}>
                  <Icon
                    name="cart-outline"
                    size={16}
                    color={isDark ? '#93C5FD' : Colors.primary}
                  />
                  <Text
                    style={[
                      styles.creditBreakdownLabel,
                      {color: colors.textSecondary},
                    ]}>
                    Credit mua riêng
                  </Text>
                </View>
                <Text
                  style={[
                    styles.creditBreakdownValue,
                    {color: colors.heading},
                  ]}>
                  {loadingAccountSummary
                    ? '...'
                    : formatCredits(creditSummary.regularCreditBalance)}
                </Text>
              </View>

              {creditSummary.hasActivePlan && (
                <View
                  style={[
                    styles.creditBreakdownCard,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                      borderColor: colors.border,
                    },
                  ]}>
                  <View style={styles.creditBreakdownHeader}>
                    <Icon
                      name="crown-outline"
                      size={16}
                      color={isDark ? '#FBBF24' : '#D97706'}
                    />
                    <Text
                      style={[
                        styles.creditBreakdownLabel,
                        {color: colors.textSecondary},
                      ]}>
                      Credit từ gói
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.creditBreakdownValue,
                      {color: colors.heading},
                    ]}>
                    {loadingAccountSummary
                      ? '...'
                      : formatCredits(creditSummary.planCreditBalance)}
                  </Text>
                  {!!creditExpiry && (
                    <Text
                      style={[
                        styles.creditBreakdownMeta,
                        {color: colors.textSecondary},
                      ]}>
                      Hết hạn vào {creditExpiry}
                    </Text>
                  )}
                </View>
              )}
            </View>
            <Button
              title="Mua credit"
              variant="outline"
              size="sm"
              onPress={() => navigation.navigate('CreditPackages')}
              icon="lightning-bolt"
              style={styles.creditActionBtn}
            />
          </View>
        </View>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Biến động số dư credit
        </Text>
        <View
          style={[
            styles.creditHistoryCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}>
          {loadingAccountSummary ? (
            <LoadingSpinner fullScreen={false} size="small" />
          ) : creditTransactions.length === 0 ? (
            <View style={styles.creditHistoryEmpty}>
              <Icon
                name="timeline-clock-outline"
                size={28}
                color={colors.textTertiary}
              />
              <Text
                style={[
                  styles.creditHistoryEmptyText,
                  {color: colors.textSecondary},
                ]}>
                Chưa có biến động credit nào gần đây
              </Text>
            </View>
          ) : (
            creditTransactions.map((transaction, index) => {
              const isPositive = Number(transaction.creditChange || 0) >= 0;
              const activity = getCreditTransactionActivity(transaction);
              return (
                <View
                  key={transaction.id}
                  style={[
                    styles.creditHistoryRow,
                    index < creditTransactions.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}>
                  <View
                    style={[
                      styles.creditHistoryIconWrap,
                      {
                        backgroundColor: isPositive
                          ? isDark
                            ? 'rgba(16,185,129,0.16)'
                            : '#ECFDF5'
                          : isDark
                          ? 'rgba(245,158,11,0.16)'
                          : '#FFF7ED',
                      },
                    ]}>
                    <Icon
                      name={getCreditTransactionIcon(
                        transaction.type,
                        transaction.source,
                        transaction.note,
                      )}
                      size={18}
                      color={
                        isPositive
                          ? isDark
                            ? '#34D399'
                            : '#059669'
                          : isDark
                          ? '#FBBF24'
                          : '#D97706'
                      }
                    />
                  </View>

                  <View style={styles.creditHistoryContent}>
                    <Text
                      style={[
                        styles.creditHistoryTitle,
                        {color: colors.heading},
                      ]}>
                      {activity.title}
                    </Text>
                    {!!activity.subtitle && (
                      <Text
                        style={[
                          styles.creditHistoryMeta,
                          {color: colors.textSecondary},
                        ]}>
                        {activity.subtitle}
                      </Text>
                    )}
                    <Text
                      style={[
                        styles.creditHistoryMeta,
                        {color: colors.textSecondary},
                      ]}>
                      {getCreditTransactionSourceLabel(transaction.source)}
                      {' • '}
                      {formatCreditDateTime(transaction.createdAt)}
                    </Text>
                    {transaction.balanceAfter != null && (
                      <Text
                        style={[
                          styles.creditHistoryMeta,
                          {color: colors.textTertiary},
                        ]}>
                        Số dư sau biến động:{' '}
                        {formatCredits(transaction.balanceAfter)} credit
                      </Text>
                    )}
                  </View>

                  <Text
                    style={[
                      styles.creditHistoryAmount,
                      {
                        color: isPositive
                          ? isDark
                            ? '#34D399'
                            : '#059669'
                          : isDark
                          ? '#FBBF24'
                          : '#D97706',
                      },
                    ]}>
                    {isPositive ? '+' : ''}
                    {formatCredits(transaction.creditChange)}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* Quick Links */}
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Tài khoản
        </Text>
        {[
          {
            icon: 'crown-outline',
            label: 'Gói đăng ký',
            desc: 'Quản lý gói của bạn',
            screen: 'Subscription',
            color: '#F59E0B',
          },
          {
            icon: 'lightning-bolt-circle',
            label: 'Mua credit',
            desc: 'Nạp thêm credit cho tài khoản',
            screen: 'CreditPackages',
            color: Colors.primary,
          },
          {
            icon: 'cog-outline',
            label: 'Cài đặt',
            desc: 'Tùy chọn ứng dụng',
            screen: 'Settings',
            color: colors.icon,
          },
        ].map(item => (
          <TouchableOpacity
            key={item.label}
            onPress={() => navigation.navigate(item.screen)}
            style={[
              styles.menuItem,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <View
              style={[
                styles.menuIconWrap,
                {backgroundColor: `${item.color}15`},
              ]}>
              <Icon name={item.icon} size={20} color={item.color} />
            </View>
            <View style={styles.menuContent}>
              <Text style={[styles.menuLabel, {color: colors.text}]}>
                {item.label}
              </Text>
              <Text style={[styles.menuDesc, {color: colors.textTertiary}]}>
                {item.desc}
              </Text>
            </View>
            <Icon
              name="chevron-right"
              size={20}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {fontSize: 20, fontWeight: '700'},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 4},
  editBtn: {padding: Spacing.sm},
  settingsBtn: {padding: Spacing.sm},
  scrollContent: {padding: Spacing.lg, paddingBottom: 40},

  // Identity
  identityCard: {marginBottom: Spacing.lg},
  identityTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
  },
  avatarWrap: {position: 'relative'},
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  identityInfo: {flex: 1, paddingTop: 4},
  fullName: {fontSize: 20, fontWeight: '700'},
  username: {fontSize: 14, marginTop: 2},
  email: {fontSize: 12, marginTop: 2},
  birthdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  birthdayText: {fontSize: 12},

  // Edit fields
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  pickerTitle: {fontSize: 16, fontWeight: '600'},
  pickerHeaderBtn: {fontSize: 15},
  pickerColumns: {
    flexDirection: 'row',
    height: 220,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  pickerCol: {flex: 1, marginHorizontal: 4},
  pickerColLabel: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 6,
    fontWeight: '500',
  },
  pickerScroll: {flex: 1},
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 8,
    marginBottom: 2,
    alignItems: 'center',
  },
  pickerItemText: {fontSize: 14},
  editFields: {gap: Spacing.sm},
  datePickerBtn: {
    height: 56,
    borderWidth: 1.5,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  datePickerLabel: {
    fontSize: 11,
    fontWeight: '400',
    marginBottom: 2,
  },
  datePickerValue: {
    fontSize: 14,
    fontWeight: '400',
  },
  datePickerIcon: {
    position: 'absolute',
    right: 14,
    top: 18,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  editActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // XP
  xpSection: {marginTop: Spacing.sm},
  xpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  xpLabel: {fontSize: 12, fontWeight: '600'},
  xpValue: {fontSize: 12},
  xpBarBg: {height: 8, borderRadius: 4, overflow: 'hidden'},
  xpBarFill: {height: '100%', borderRadius: 4},

  // Account summary
  accountSummaryGrid: {
    flexDirection: 'column',
    gap: Spacing.sm,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
  },
  planCardContent: {
    flex: 1,
  },
  accountSummaryCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
  },
  creditHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  accountSummaryTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  accountSummaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountSummaryLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: 6,
  },
  accountSummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  accountSummaryHint: {
    fontSize: 12,
    marginTop: 6,
    lineHeight: 18,
  },
  creditValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  creditPrimaryValue: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  creditPrimaryUnit: {
    fontSize: 12,
    marginBottom: 4,
  },
  creditBreakdownList: {
    marginTop: Spacing.sm,
    gap: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  creditBreakdownCard: {
    flex: 1,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    minHeight: 88,
  },
  creditBreakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creditBreakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  creditBreakdownValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 6,
  },
  creditBreakdownMeta: {
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  creditActionBtn: {marginTop: Spacing.md},

  // Credit history
  creditHistoryCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  creditHistoryEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
    gap: 8,
  },
  creditHistoryEmptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  creditHistoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
  },
  creditHistoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditHistoryContent: {
    flex: 1,
    gap: 3,
  },
  creditHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  creditHistoryMeta: {
    fontSize: 11,
    lineHeight: 16,
  },
  creditHistoryAmount: {
    fontSize: 15,
    fontWeight: '700',
    paddingTop: 2,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },

  // Stats
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm) / 2,
    alignItems: 'center',
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 4,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  statValue: {fontSize: 20, fontWeight: '700'},
  statLabel: {fontSize: 11},

  // Badges
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badgeCard: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    width: (SCREEN_WIDTH - Spacing.lg * 2 - Spacing.sm * 2) / 3,
  },
  badgeEmoji: {fontSize: 28},
  badgeName: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  emptyBadges: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  emptyText: {fontSize: 13},

  // Menu
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
    gap: 12,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {flex: 1},
  menuLabel: {fontSize: 14, fontWeight: '500'},
  menuDesc: {fontSize: 11, marginTop: 1},
});
