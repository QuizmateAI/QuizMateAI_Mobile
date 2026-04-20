import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Button from '../../components/ui/Button';
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

export default function PersonalWalletScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [creditSummary, setCreditSummary] = useState(EMPTY_CREDIT_SUMMARY);
  const [creditTransactions, setCreditTransactions] = useState<any[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadWalletData = useCallback(async (pageNum = 0) => {
    try {
      const [planResult, creditResult, transactionResult] = await Promise.allSettled([
        ManagementSystemAPI.getCurrentUserPlan(),
        ManagementSystemAPI.getMyWallet(),
        ManagementSystemAPI.getMyWalletTransactions(pageNum, 10),
      ]);

      setCurrentPlan(planResult.status === 'fulfilled' ? planResult.value.data : null);
      setCreditSummary(
        creditResult.status === 'fulfilled' ? creditResult.value.data : EMPTY_CREDIT_SUMMARY,
      );

      const newTransactions =
        transactionResult.status === 'fulfilled' ? transactionResult.value.data : [];

      if (pageNum === 0) {
        setCreditTransactions(newTransactions);
      } else {
        setCreditTransactions(prev => [...prev, ...newTransactions]);
      }

      setHasMore((newTransactions || []).length >= 10);
      setPage(pageNum);
    } catch (error) {
      console.error('PersonalWalletScreen loadWalletData error:', error);
      if (pageNum === 0) {
        showToast('Không thể tải dữ liệu ví', 'error');
      }
    }
  }, [showToast]);

  useEffect(() => {
    setLoading(true);
    loadWalletData(0).finally(() => setLoading(false));
  }, [loadWalletData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWalletData(0);
    setRefreshing(false);
  }, [loadWalletData]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      setLoadingMore(true);
      loadWalletData(page + 1).finally(() => setLoadingMore(false));
    }
  }, [loadingMore, hasMore, page, loadWalletData]);

  const currentPlanName = loading ? 'Đang tải...' : getCurrentPlanName(currentPlan);
  const currentPlanSubtitle = loading ? 'Đang cập nhật thông tin gói' : getCurrentPlanSubtitle(currentPlan);
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={28} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>Ví credit</Text>
        <View style={{width: 28}} />
      </View>

      {loading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          {/* Credit Summary Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>Số dư credit</Text>

            {/* Current Plan Card */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Subscription')}
              style={[
                styles.planCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View
                style={[
                  styles.planIcon,
                  {backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : '#FEF3C7'},
                ]}>
                <Icon
                  name="crown-outline"
                  size={24}
                  color={isDark ? '#FBBF24' : '#D97706'}
                />
              </View>
              <View style={styles.planContent}>
                <Text style={[styles.planLabel, {color: colors.textTertiary}]}>
                  Gói hiện tại
                </Text>
                <Text style={[styles.planName, {color: colors.heading}]}>
                  {currentPlanName}
                </Text>
                <Text style={[styles.planSubtitle, {color: colors.textSecondary}]}>
                  {currentPlanSubtitle}
                </Text>
              </View>
              <Icon name="chevron-right" size={24} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Credit Balance Card */}
            <View
              style={[
                styles.creditCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View style={styles.creditHeader}>
                <View
                  style={[
                    styles.creditIcon,
                    {backgroundColor: isDark ? 'rgba(37,99,235,0.18)' : '#DBEAFE'},
                  ]}>
                  <Icon
                    name="lightning-bolt-circle"
                    size={24}
                    color={isDark ? '#93C5FD' : Colors.primary}
                  />
                </View>
                <Text style={[styles.creditLabel, {color: colors.textTertiary}]}>
                  Số dư credit
                </Text>
              </View>
              <Text style={[styles.creditAmount, {color: colors.heading}]}>
                {formatCredits(creditSummary.totalAvailableCredits)}
                <Text style={{fontSize: 14, color: colors.textSecondary}}> credit</Text>
              </Text>
              <Button
                title="Mua credit"
                variant="outline"
                size="sm"
                onPress={() => navigation.navigate('CreditPackages')}
                icon="lightning-bolt"
                style={styles.buyBtn}
              />
            </View>

            {/* Credit Breakdown */}
            <View style={styles.breakdownContainer}>
              <View
                style={[
                  styles.breakdownCard,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <View style={styles.breakdownHeader}>
                  <Icon
                    name="shopping-outline"
                    size={18}
                    color={isDark ? '#93C5FD' : Colors.primary}
                  />
                  <Text style={[styles.breakdownLabel, {color: colors.textSecondary}]}>
                    Credit mua riêng
                  </Text>
                </View>
                <Text style={[styles.breakdownAmount, {color: colors.heading}]}>
                  {formatCredits(creditSummary.regularCreditBalance)}
                </Text>
              </View>

              {creditSummary.hasActivePlan && (
                <View
                  style={[
                    styles.breakdownCard,
                    {backgroundColor: colors.surface, borderColor: colors.border},
                  ]}>
                  <View style={styles.breakdownHeader}>
                    <Icon
                      name="crown-outline"
                      size={18}
                      color={isDark ? '#FBBF24' : '#D97706'}
                    />
                    <Text style={[styles.breakdownLabel, {color: colors.textSecondary}]}>
                      Credit từ gói
                    </Text>
                  </View>
                  <Text style={[styles.breakdownAmount, {color: colors.heading}]}>
                    {formatCredits(creditSummary.planCreditBalance)}
                  </Text>
                  {creditExpiry && (
                    <Text style={[styles.breakdownMeta, {color: colors.textSecondary}]}>
                      Hết hạn vào {creditExpiry}
                    </Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {/* Transaction History Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, {color: colors.heading}]}>
              Biến động số dư credit
            </Text>

            {creditTransactions.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  {backgroundColor: colors.surface, borderColor: colors.border},
                ]}>
                <Icon name="timeline-clock-outline" size={40} color={colors.textTertiary} />
                <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                  Chưa có biến động credit nào gần đây
                </Text>
              </View>
            ) : (
              <View style={[styles.transactionList, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                {creditTransactions.map((transaction, index) => {
                  const isPositive = Number(transaction.creditChange || 0) >= 0;
                  const activity = getCreditTransactionActivity(transaction);
                  return (
                    <View
                      key={transaction.id || index}
                      style={[
                        styles.transactionItem,
                        {borderBottomColor: colors.border},
                        index === creditTransactions.length - 1 && {borderBottomWidth: 0},
                      ]}>
                      <View
                        style={[
                          styles.transactionIcon,
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

                      <View style={styles.transactionContent}>
                        <Text style={[styles.transactionTitle, {color: colors.heading}]}>
                          {activity.title}
                        </Text>
                        {activity.subtitle && (
                          <Text style={[styles.transactionSubtitle, {color: colors.textSecondary}]}>
                            {activity.subtitle}
                          </Text>
                        )}
                        <Text style={[styles.transactionMeta, {color: colors.textTertiary}]}>
                          {getCreditTransactionSourceLabel(transaction.source)} • {formatCreditDateTime(transaction.createdAt)}
                        </Text>
                        {transaction.balanceAfter != null && (
                          <Text style={[styles.transactionBalance, {color: colors.textTertiary}]}>
                            Số dư sau: {formatCredits(transaction.balanceAfter)} credit
                          </Text>
                        )}
                      </View>

                      <Text
                        style={[
                          styles.transactionAmount,
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
                })}
              </View>
            )}

            {hasMore && (
              <Button
                title={loadingMore ? 'Đang tải...' : 'Xem thêm'}
                variant="outline"
                size="md"
                onPress={loadMore}
                loading={loadingMore}
                style={styles.loadMoreBtn}
              />
            )}
          </View>
        </ScrollView>
      )}
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
    borderBottomWidth: 1,
  },
  backBtn: {width: 28, alignItems: 'center'},
  headerTitle: {fontSize: 18, fontWeight: '600', flex: 1, textAlign: 'center'},
  scrollView: {flex: 1},
  scrollContent: {padding: Spacing.lg, paddingBottom: Spacing.xl},
  section: {marginBottom: Spacing['2xl']},
  sectionTitle: {fontSize: 16, fontWeight: '600', marginBottom: Spacing.md},
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  planContent: {flex: 1},
  planLabel: {fontSize: 12},
  planName: {fontSize: 16, fontWeight: '600', marginVertical: 2},
  planSubtitle: {fontSize: 12},
  creditCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  creditHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md},
  creditIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  creditLabel: {fontSize: 14},
  creditAmount: {fontSize: 28, fontWeight: '700', marginVertical: Spacing.md},
  buyBtn: {marginTop: Spacing.md},
  breakdownContainer: {gap: Spacing.md},
  breakdownCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  breakdownHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  breakdownLabel: {fontSize: 12, marginLeft: Spacing.sm},
  breakdownAmount: {fontSize: 18, fontWeight: '700'},
  breakdownMeta: {fontSize: 11, marginTop: 4},
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  emptyText: {fontSize: 14, marginTop: Spacing.md},
  transactionList: {borderRadius: BorderRadius.lg, borderWidth: 1, overflow: 'hidden'},
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    marginTop: 2,
  },
  transactionContent: {flex: 1},
  transactionTitle: {fontSize: 14, fontWeight: '600', marginBottom: 2},
  transactionSubtitle: {fontSize: 12, marginBottom: 4},
  transactionMeta: {fontSize: 11},
  transactionBalance: {fontSize: 11, marginTop: 4},
  transactionAmount: {fontSize: 14, fontWeight: '700', textAlign: 'right'},
  loadMoreBtn: {marginTop: Spacing.lg},
});
