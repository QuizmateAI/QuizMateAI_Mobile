import React, {useCallback, useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import TabBar from '../../components/ui/TabBar';
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
} from '../../utils/accountSummary';

const creditIcon = require('../../assets/Quizmate-Credit-64.webp');

type HistoryTabKey = 'payment' | 'usage';

const HISTORY_TABS = [
  {key: 'payment', label: 'Lịch sử thanh toán'},
  {key: 'usage', label: 'Lịch sử sử dụng'},
];

const PAYMENT_TARGET_LABELS: Record<string, string> = {
  USER_PLAN: 'Gói cá nhân',
  WORKSPACE_PLAN: 'Gói nhóm',
  USER_CREDIT: 'Mua credit cá nhân',
  WORKSPACE_CREDIT: 'Mua credit nhóm',
  WORKSPACE_SLOT: 'Mua thêm chỗ nhóm',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

const normalizePayments = (response: any) => {
  const data = response?.data?.data ?? response?.data ?? response ?? {};
  return Array.isArray(data?.content) ? data.content : Array.isArray(data) ? data : [];
};

const formatCurrency = (value: any) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) {
    return '0 đ';
  }

  return `${new Intl.NumberFormat('vi-VN').format(amount)} đ`;
};

const canBuyCreditFromPlan = (currentPlan: any) => {
  const entitlement = currentPlan?.plan?.entitlement || currentPlan?.entitlement;
  return entitlement?.canBuyCredit === true;
};

const getPlanStatusLabel = (currentPlan: any) => {
  if (currentPlan?.defaultPlan) {
    return 'Đang hoạt động';
  }

  const status = String(currentPlan?.status || '').toUpperCase();
  const labels: Record<string, string> = {
    ACTIVE: 'Đang hoạt động',
    PENDING: 'Đang xử lý',
    EXPIRED: 'Đã hết hạn',
    CANCELLED: 'Đã hủy',
    CANCELED: 'Đã hủy',
  };

  return labels[status] || 'Đang hoạt động';
};

const getPlanValidUntil = (currentPlan: any) => {
  if (currentPlan?.defaultPlan) {
    return 'Theo cấu hình gói';
  }

  const expiresAt = formatPlanDate(currentPlan?.expiresAt);
  return expiresAt || 'Theo cấu hình gói';
};

const getPaymentTitle = (payment: any) => {
  const directName = String(
    payment?.planName ||
      payment?.planDisplayName ||
      payment?.creditPackageName ||
      payment?.creditPackageDisplayName ||
      '',
  ).trim();

  if (directName) {
    return directName;
  }

  return (
    PAYMENT_TARGET_LABELS[
      String(payment?.paymentTargetType || '').toUpperCase()
    ] || 'Thanh toán'
  );
};

const getPaymentDate = (payment: any) =>
  payment?.paidAt || payment?.gatewayVerifiedAt || payment?.createdAt || null;

const getPaymentStatusVariant = (status: string) => {
  if (status === 'COMPLETED') {
    return 'success' as const;
  }

  if (status === 'PENDING') {
    return 'warning' as const;
  }

  if (status === 'FAILED') {
    return 'error' as const;
  }

  return 'default' as const;
};

const getPaymentIcon = (payment: any) => {
  const target = String(payment?.paymentTargetType || '').toUpperCase();

  if (target.includes('CREDIT')) {
    return 'wallet-plus-outline';
  }

  if (target.includes('WORKSPACE')) {
    return 'account-group-outline';
  }

  return 'credit-card-outline';
};

export default function PersonalWalletScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<HistoryTabKey>('payment');
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [creditSummary, setCreditSummary] = useState(EMPTY_CREDIT_SUMMARY);
  const [payments, setPayments] = useState<any[]>([]);
  const [usageTransactions, setUsageTransactions] = useState<any[]>([]);
  const [paymentError, setPaymentError] = useState('');
  const [usageError, setUsageError] = useState('');

  const loadWalletData = useCallback(async () => {
    const [planResult, walletResult, paymentResult, usageResult] =
      await Promise.allSettled([
        ManagementSystemAPI.getCurrentUserPlan(),
        ManagementSystemAPI.getMyWallet(),
        ManagementSystemAPI.getUserPayments(0, 5),
        ManagementSystemAPI.getMyWalletTransactions(0, 5),
      ]);

    setCurrentPlan(planResult.status === 'fulfilled' ? planResult.value.data : null);
    setCreditSummary(
      walletResult.status === 'fulfilled'
        ? walletResult.value.data
        : EMPTY_CREDIT_SUMMARY,
    );

    if (paymentResult.status === 'fulfilled') {
      setPayments(normalizePayments(paymentResult.value));
      setPaymentError('');
    } else {
      setPayments([]);
      setPaymentError('Không thể tải lịch sử thanh toán.');
    }

    if (usageResult.status === 'fulfilled') {
      setUsageTransactions(
        Array.isArray(usageResult.value.data) ? usageResult.value.data : [],
      );
      setUsageError('');
    } else {
      setUsageTransactions([]);
      setUsageError('Không thể tải lịch sử sử dụng credit.');
    }

    if (
      planResult.status !== 'fulfilled' &&
      walletResult.status !== 'fulfilled' &&
      paymentResult.status !== 'fulfilled' &&
      usageResult.status !== 'fulfilled'
    ) {
      showToast('Không thể tải dữ liệu ví credit', 'error');
    }
  }, [showToast]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadWalletData().finally(() => setLoading(false));
    }, [loadWalletData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWalletData();
    setRefreshing(false);
  }, [loadWalletData]);

  const canBuyCredit = useMemo(
    () => canBuyCreditFromPlan(currentPlan),
    [currentPlan],
  );
  const currentPlanName = loading ? 'Đang tải...' : getCurrentPlanName(currentPlan);
  const currentPlanStatus = getPlanStatusLabel(currentPlan);
  const currentPlanValidity = getPlanValidUntil(currentPlan);
  const planCreditExpiry = formatPlanDate(creditSummary.planCreditExpiresAt);
  const historyItems = activeTab === 'payment' ? payments : usageTransactions;
  const historyError = activeTab === 'payment' ? paymentError : usageError;

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      <View
        style={[
          styles.header,
          {backgroundColor: colors.surface, borderBottomColor: colors.border},
        ]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={28} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: isDark ? '#F8FAFC' : '#020617'}]}>
          Quản lý gói
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <Text
          style={[
            styles.planSectionHeading,
            {color: isDark ? 'rgba(191,219,254,0.8)' : '#1D4ED8'},
          ]}>
          Gói của bạn
        </Text>

        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => navigation.navigate('Subscription')}
          style={[
            styles.planHeroCard,
            {backgroundColor: isDark ? '#1D4ED8' : '#2563EB'},
          ]}>
          <View style={styles.planHeroTop}>
            <View
              style={[
                styles.currentBadge,
                {
                  borderColor: isDark
                    ? 'rgba(147,197,253,0.30)'
                    : 'rgba(255,255,255,0.25)',
                  backgroundColor: isDark
                    ? 'rgba(147,197,253,0.10)'
                    : 'rgba(255,255,255,0.15)',
                },
              ]}>
              <Text style={styles.currentBadgeText}>Đang dùng</Text>
            </View>
            <Icon name="credit-card-outline" size={22} color="#FFFFFF" />
          </View>

          <Text style={styles.planHeroTitle}>{currentPlanName}</Text>
          <Text
            style={[
              styles.planHeroSubtitle,
              {color: isDark ? 'rgba(219,234,254,0.80)' : '#EFF6FF'},
            ]}>
            Trạng thái: {currentPlanStatus}
          </Text>

          <View style={styles.planHeroMetaGrid}>
            <View style={styles.planHeroMetaItem}>
              <Text
                style={[
                  styles.planHeroMetaLabel,
                  {color: isDark ? 'rgba(219,234,254,0.70)' : '#EFF6FF'},
                ]}>
                Hiệu lực đến
              </Text>
              <Text style={styles.planHeroMetaValue}>{currentPlanValidity}</Text>
            </View>
            <View style={styles.planHeroMetaItem}>
              <Text
                style={[
                  styles.planHeroMetaLabel,
                  {color: isDark ? 'rgba(219,234,254,0.70)' : '#EFF6FF'},
                ]}>
                Phạm vi
              </Text>
              <Text style={styles.planHeroMetaValue}>Cá nhân</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View
          style={[
            styles.walletCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.walletHeader}>
            <View>
              <Text style={[styles.walletEyebrow, {color: '#64748B'}]}>
                VÍ CREDIT
              </Text>
              <View style={styles.walletBalanceRow}>
                <Image
                  source={creditIcon}
                  style={styles.creditIconImage}
                  resizeMode="contain"
                />
                <Text
                  style={[
                    styles.walletBalanceValue,
                    {color: isDark ? '#F8FAFC' : '#020617'},
                  ]}>
                  {formatCredits(creditSummary.totalAvailableCredits)}
                </Text>
              </View>
            </View>
            <Icon
              name="wallet-outline"
              size={20}
              color={isDark ? '#94A3B8' : '#64748B'}
            />
          </View>

          <View style={styles.walletBreakdownGrid}>
            <View
              style={[
                styles.breakdownCard,
                {
                  backgroundColor: isDark
                    ? 'rgba(16,185,129,0.10)'
                    : '#ECFDF5',
                  borderColor: isDark
                    ? 'rgba(52,211,153,0.20)'
                    : '#A7F3D0',
                },
              ]}>
              <Text style={[styles.breakdownLabel, {color: isDark ? '#6EE7B7' : '#047857'}]}>
                Credit thường
              </Text>
              <Text style={[styles.breakdownValue, {color: isDark ? '#D1FAE5' : '#064E3B'}]}>
                {formatCredits(creditSummary.regularCreditBalance)}
              </Text>
            </View>

            <View
              style={[
                styles.breakdownCard,
                {
                  backgroundColor: isDark
                    ? 'rgba(139,92,246,0.10)'
                    : '#F5F3FF',
                  borderColor: isDark
                    ? 'rgba(167,139,250,0.20)'
                    : '#DDD6FE',
                },
              ]}>
              <Text style={[styles.breakdownLabel, {color: isDark ? '#C4B5FD' : '#6D28D9'}]}>
                Credit từ gói
              </Text>
              <Text style={[styles.breakdownValue, {color: isDark ? '#EDE9FE' : '#4C1D95'}]}>
                {formatCredits(creditSummary.planCreditBalance)}
              </Text>
              {planCreditExpiry ? (
                <Text style={[styles.breakdownMeta, {color: colors.textSecondary}]}>
                  Hết hạn: {planCreditExpiry}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View
          style={[
            styles.purchaseCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <Text style={[styles.cardTitle, {color: colors.heading}]}>Mua thêm credit</Text>
          <Text style={[styles.cardDescription, {color: colors.textSecondary}]}>
            Chọn gói credit phù hợp để tiếp tục sử dụng các tính năng AI.
          </Text>

          {canBuyCredit ? (
            <Button
              title="Chọn gói credit"
              onPress={() => navigation.navigate('CreditPackages')}
              icon="arrow-right"
              iconPosition="right"
              style={styles.purchaseAction}
            />
          ) : (
            <View
              style={[
                styles.creditNotice,
                {
                  backgroundColor: isDark ? '#111827' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <Icon name="information-outline" size={18} color={colors.textSecondary} />
              <Text style={[styles.creditNoticeText, {color: colors.textSecondary}]}>
                Gói hiện tại của bạn không hỗ trợ mua thêm credit.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.historyHeader}>
          <Text style={[styles.sectionHeading, styles.historyTitle, {color: colors.heading}]}>
            Lịch sử gần đây
          </Text>
          <TouchableOpacity
            onPress={onRefresh}
            disabled={refreshing}
            style={[
              styles.refreshButton,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            {refreshing ? (
              <LoadingSpinner fullScreen={false} size="small" />
            ) : (
              <Icon name="refresh" size={18} color={colors.icon} />
            )}
          </TouchableOpacity>
        </View>

        <TabBar
          tabs={HISTORY_TABS}
          activeTab={activeTab}
          onTabChange={key => setActiveTab(key as HistoryTabKey)}
        />

        <Text style={[styles.historyHint, {color: colors.textSecondary}]}>
          {activeTab === 'payment'
            ? '5 giao dịch thanh toán mới nhất'
            : '5 biến động credit mới nhất'}
        </Text>

        {historyError ? (
          <View
            style={[
              styles.infoState,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Icon name="alert-circle-outline" size={28} color={Colors.error} />
            <Text style={[styles.infoTitle, {color: colors.heading}]}>Không tải được dữ liệu</Text>
            <Text style={[styles.infoText, {color: colors.textSecondary}]}>
              {historyError}
            </Text>
          </View>
        ) : historyItems.length === 0 ? (
          <View
            style={[
              styles.infoState,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Icon name="history" size={28} color={colors.textTertiary} />
            <Text style={[styles.infoTitle, {color: colors.heading}]}>
              Chưa có dữ liệu gần đây
            </Text>
            <Text style={[styles.infoText, {color: colors.textSecondary}]}>
              {activeTab === 'payment'
                ? 'Thanh toán mới sẽ hiển thị tại đây.'
                : 'Hoạt động sử dụng credit sẽ hiển thị tại đây.'}
            </Text>
          </View>
        ) : activeTab === 'payment' ? (
          <View style={styles.historyList}>
            {payments.map((payment, index) => {
              const status = String(payment?.paymentStatus || '').toUpperCase();
              const paymentDate = getPaymentDate(payment);
              const amount = payment?.amount ?? payment?.gatewayAmount;

              return (
                <View
                  key={String(payment?.paymentId ?? payment?.orderId ?? index)}
                  style={[
                    styles.historyCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.historyTopRow}>
                    <View
                      style={[
                        styles.historyIconWrap,
                        {
                          backgroundColor: isDark
                            ? 'rgba(37,99,235,0.18)'
                            : '#EFF6FF',
                        },
                      ]}>
                      <Icon
                        name={getPaymentIcon(payment)}
                        size={18}
                        color={isDark ? '#93C5FD' : Colors.primary}
                      />
                    </View>

                    <View style={styles.historyContent}>
                      <Text style={[styles.historyItemTitle, {color: colors.heading}]}>
                        {getPaymentTitle(payment)}
                      </Text>
                      <Text style={[styles.historyItemMeta, {color: colors.textSecondary}]}>
                        {(payment?.paymentMethod || 'Thanh toán').toUpperCase()}
                        {payment?.orderId ? ` • ${payment.orderId}` : ''}
                      </Text>
                      <Text style={[styles.historyItemMeta, {color: colors.textTertiary}]}>
                        {paymentDate ? formatCreditDateTime(paymentDate) : 'Chưa có thời gian'}
                      </Text>
                    </View>

                    <View style={styles.paymentRightCol}>
                      <Text style={[styles.paymentAmount, {color: colors.heading}]}>
                        {formatCurrency(amount)}
                      </Text>
                      <Badge
                        label={PAYMENT_STATUS_LABELS[status] || status || 'Khác'}
                        variant={getPaymentStatusVariant(status)}
                        size="sm"
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.historyList}>
            {usageTransactions.map((transaction, index) => {
              const isPositive = Number(transaction.creditChange || 0) >= 0;
              const activity = getCreditTransactionActivity(transaction);

              return (
                <View
                  key={String(transaction.id || index)}
                  style={[
                    styles.historyCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.historyTopRow}>
                    <View
                      style={[
                        styles.historyIconWrap,
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

                    <View style={styles.historyContent}>
                      <Text style={[styles.historyItemTitle, {color: colors.heading}]}>
                        {activity.title}
                      </Text>
                      {activity.subtitle ? (
                        <Text style={[styles.historyItemMeta, {color: colors.textSecondary}]}>
                          {activity.subtitle}
                        </Text>
                      ) : null}
                      <Text style={[styles.historyItemMeta, {color: colors.textSecondary}]}>
                        {getCreditTransactionSourceLabel(transaction.source)}
                      </Text>
                      <Text style={[styles.historyItemMeta, {color: colors.textTertiary}]}>
                        {formatCreditDateTime(transaction.createdAt)}
                      </Text>
                      {transaction.balanceAfter != null ? (
                        <Text style={[styles.historyItemMeta, {color: colors.textTertiary}]}>
                          Số dư sau: {formatCredits(transaction.balanceAfter)} credit
                        </Text>
                      ) : null}
                    </View>

                    <Text
                      style={[
                        styles.usageAmount,
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
                </View>
              );
            })}
          </View>
        )}
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
  backBtn: {
    width: 28,
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  scrollView: {flex: 1},
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  planSectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.16,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  planHeroCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  planHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  currentBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  currentBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  planHeroTitle: {
    marginTop: Spacing.lg,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    letterSpacing: 0,
  },
  planHeroSubtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  planHeroMetaGrid: {
    flexDirection: 'row',
    gap: Spacing.base,
    marginTop: Spacing.lg,
  },
  planHeroMetaItem: {
    flex: 1,
  },
  planHeroMetaLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  planHeroMetaValue: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  walletCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  walletHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  walletEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.16,
    textTransform: 'uppercase',
  },
  walletBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: Spacing.md,
  },
  creditIconImage: {
    width: 40,
    height: 40,
    borderRadius: 16,
  },
  walletBalanceValue: {
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    letterSpacing: 0,
  },
  walletBreakdownGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  breakdownCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
    minHeight: 88,
  },
  breakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  breakdownMeta: {
    marginTop: 6,
    fontSize: 11,
  },
  purchaseCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  cardDescription: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
  },
  purchaseAction: {
    marginTop: Spacing.lg,
  },
  creditNotice: {
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  creditNoticeText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  historyTitle: {
    marginBottom: 0,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyHint: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    fontSize: 13,
  },
  infoState: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  infoTitle: {
    marginTop: Spacing.md,
    fontSize: 16,
    fontWeight: '700',
  },
  infoText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  historyList: {
    gap: Spacing.md,
  },
  historyCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.base,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
  },
  historyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyItemMeta: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  paymentRightCol: {
    alignItems: 'flex-end',
    gap: 8,
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: '700',
  },
  usageAmount: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
});
