import React, {useEffect, useMemo, useState} from 'react';
import {
  Linking,
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
import ManagementSystemAPI from '../../api/ManagementSystemAPI';
import PaymentAPI from '../../api/PaymentAPI';
import {
  EMPTY_CREDIT_SUMMARY,
  formatCredits,
  formatPlanDate,
} from '../../utils/accountSummary';

type PaymentMethod = 'momo' | 'vnpay';

type CreditPackageItem = {
  id: number;
  displayName: string;
  baseCredit: number;
  bonusCredit: number;
  totalCredits: number;
  price: number;
};

const mapCreditPackage = (item: any): CreditPackageItem => {
  const baseCredit = Number(item?.baseCredit || 0);
  const bonusCredit = Number(item?.bonusCredit || 0);

  return {
    id: Number(item?.creditPackageId ?? item?.id ?? 0),
    displayName: item?.displayName ?? item?.name ?? 'Gói credit',
    baseCredit,
    bonusCredit,
    totalCredits: baseCredit + bonusCredit,
    price: Number(item?.price || 0),
  };
};

export default function CreditPackagesScreen({navigation, route}: any) {
  const workspaceId = Number(route?.params?.workspaceId || 0);
  const workspaceName = String(route?.params?.workspaceName || '');
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creditSummary, setCreditSummary] = useState(EMPTY_CREDIT_SUMMARY);
  const [packages, setPackages] = useState<CreditPackageItem[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(
    null,
  );
  const [selectedMethod, setSelectedMethod] =
    useState<PaymentMethod>('momo');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      setLoading(true);
      setLoadError(null);

      const [walletResult, packageResult] = await Promise.allSettled([
        workspaceId > 0
          ? ManagementSystemAPI.getGroupWorkspaceWallet(workspaceId)
          : ManagementSystemAPI.getMyWallet(),
        ManagementSystemAPI.getPurchaseableCreditPackages(),
      ]);

      if (!mounted) {
        return;
      }

      setCreditSummary(
        walletResult.status === 'fulfilled'
          ? walletResult.value.data
          : EMPTY_CREDIT_SUMMARY,
      );

      if (packageResult.status === 'fulfilled') {
        const rawPackages: any[] = packageResult.value.data?.data || [];
        const normalizedPackages: CreditPackageItem[] = rawPackages
          .map(mapCreditPackage)
          .filter((item: CreditPackageItem) => item.id > 0)
          .sort(
            (left: CreditPackageItem, right: CreditPackageItem) =>
              left.price - right.price,
          );

        setPackages(normalizedPackages);
        setSelectedPackageId(currentSelectedId => {
          if (
            currentSelectedId &&
            normalizedPackages.some(item => item.id === currentSelectedId)
          ) {
            return currentSelectedId;
          }

          return normalizedPackages[0]?.id ?? null;
        });
      } else {
        setPackages([]);
        setSelectedPackageId(null);
        setLoadError('Không thể tải danh sách gói credit');
      }

      if (workspaceId > 0) {
        const transactionResult = await Promise.allSettled([
          ManagementSystemAPI.getGroupWorkspaceWalletTransactions(workspaceId, 0, 5),
        ]);
        if (
          transactionResult[0]?.status === 'fulfilled' &&
          Array.isArray(transactionResult[0].value?.data)
        ) {
          setTransactions(transactionResult[0].value.data);
        } else {
          setTransactions([]);
        }
      } else {
        const transactionResult = await Promise.allSettled([
          ManagementSystemAPI.getMyWalletTransactions(0, 5),
        ]);
        if (
          transactionResult[0]?.status === 'fulfilled' &&
          Array.isArray(transactionResult[0].value?.data)
        ) {
          setTransactions(transactionResult[0].value.data);
        } else {
          setTransactions([]);
        }
      }

      setLoading(false);
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [workspaceId]);

  const selectedPackage = useMemo(
    () => packages.find(item => item.id === selectedPackageId) ?? null,
    [packages, selectedPackageId],
  );
  const recommendedPackageId = useMemo(() => {
    if (packages.length === 0) {
      return null;
    }

    return packages.reduce((currentBest, item) => {
      if (!currentBest) {
        return item.id;
      }

      const best = packages.find(pkg => pkg.id === currentBest);
      if (!best) {
        return item.id;
      }

      if (item.bonusCredit > best.bonusCredit) {
        return item.id;
      }

      if (
        item.bonusCredit === best.bonusCredit &&
        item.totalCredits > best.totalCredits
      ) {
        return item.id;
      }

      return currentBest;
    }, null as number | null);
  }, [packages]);
  const creditExpiry = formatPlanDate(creditSummary.planCreditExpiresAt);

  const handlePayment = async () => {
    if (!selectedPackage) {
      showToast('Vui lòng chọn gói credit', 'warning');
      return;
    }

    setProcessing(true);

    try {
      const api =
        selectedMethod === 'momo'
          ? PaymentAPI.createMomoCreditPayment
          : PaymentAPI.createVnpayCreditPayment;
      const response =
        workspaceId > 0
          ? await api(selectedPackage.id, workspaceId)
          : await api(selectedPackage.id);
      const payUrl =
        response.data?.payUrl ||
        response.data?.url ||
        response.data?.deeplink ||
        response.data?.deepLink;

      if (!payUrl) {
        showToast('Không nhận được đường dẫn thanh toán', 'error');
        return;
      }

      await Linking.openURL(payUrl);
    } catch {
      showToast('Không thể tạo thanh toán credit', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top', 'bottom']}>
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
          {workspaceId > 0 ? 'Nạp credit nhóm' : 'Mua credit'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {!!loadError && (
          <Text style={[styles.errorText, {color: Colors.error}]}>
            {loadError}
          </Text>
        )}

        <View
          style={[
            styles.summaryCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.summaryHeader}>
            <View
              style={[
                styles.summaryIconWrap,
                {
                  backgroundColor: isDark
                    ? 'rgba(37,99,235,0.18)'
                    : '#DBEAFE',
                },
              ]}>
              <Icon
                name="lightning-bolt-circle"
                size={22}
                color={isDark ? '#93C5FD' : Colors.primary}
              />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={[styles.summaryLabel, {color: colors.textTertiary}]}>
                {workspaceId > 0 ? 'Số dư nhóm hiện tại' : 'Số dư hiện tại'}
              </Text>
              <Text style={[styles.summaryValue, {color: colors.heading}]}>
                {formatCredits(creditSummary.totalAvailableCredits)} credit
              </Text>
            </View>
          </View>

          <View style={styles.breakdownList}>
            <View
              style={[
                styles.breakdownItem,
                {
                  backgroundColor: isDark ? '#111827' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.breakdownLabel, {color: colors.textSecondary}]}>
                Credit mua riêng
              </Text>
              <Text style={[styles.breakdownValue, {color: colors.heading}]}>
                {formatCredits(creditSummary.regularCreditBalance)}
              </Text>
            </View>

            <View
              style={[
                styles.breakdownItem,
                {
                  backgroundColor: isDark ? '#111827' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.breakdownLabel, {color: colors.textSecondary}]}>
                Credit từ gói
              </Text>
              <Text style={[styles.breakdownValue, {color: colors.heading}]}>
                {formatCredits(creditSummary.planCreditBalance)}
              </Text>
              {!!creditExpiry && (
                <Text style={[styles.breakdownMeta, {color: colors.textSecondary}]}>
                  Hết hạn vào {creditExpiry}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, {color: colors.heading}]}>
            Chọn gói credit
          </Text>
          <Text style={[styles.sectionDesc, {color: colors.textSecondary}]}>
            {workspaceId > 0
              ? `Credit sẽ được cộng vào ví nhóm${workspaceName ? ` (${workspaceName})` : ''} sau khi thanh toán hoàn tất`
              : 'Credit sẽ được cộng vào ví cá nhân sau khi thanh toán hoàn tất'}
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, {color: colors.heading}]}>Giao dịch gần đây</Text>
          <Text style={[styles.sectionDesc, {color: colors.textSecondary}]}>5 giao dịch credit mới nhất</Text>
        </View>
        <View style={styles.packageList}>
          {transactions.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <Icon name="history" size={24} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, {color: colors.heading}]}>Chưa có giao dịch</Text>
            </View>
          ) : (
            transactions.map((tx: any) => (
              <View
                key={String(tx.id)}
                style={[
                  styles.packageCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}>
                <View style={styles.packageTopRow}>
                  <View style={styles.packageTitleWrap}>
                    <Text style={[styles.packageTitle, {color: colors.heading}]}>
                      {tx.type || 'TRANSACTION'}
                    </Text>
                    <Text style={[styles.packageSubtitle, {color: colors.textSecondary}]}>
                      {tx.note || 'Giao dịch credit'}
                    </Text>
                  </View>
                  <Text style={[styles.packagePrice, {color: tx.creditChange >= 0 ? Colors.success : Colors.error}]}>
                    {tx.creditChange >= 0 ? '+' : ''}{tx.creditChange}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.packageList}>
          {packages.length === 0 ? (
            <View
              style={[
                styles.emptyState,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <Icon
                name="wallet-plus-outline"
                size={28}
                color={colors.textTertiary}
              />
              <Text style={[styles.emptyTitle, {color: colors.heading}]}>
                Chưa có gói credit khả dụng
              </Text>
              <Text style={[styles.emptyDesc, {color: colors.textSecondary}]}>
                Hiện chưa có gói nào để mua. Bạn thử lại sau một chút nhé.
              </Text>
            </View>
          ) : (
            packages.map(item => {
              const isSelected = item.id === selectedPackageId;
              const isRecommended = item.id === recommendedPackageId;

              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => setSelectedPackageId(item.id)}
                  style={[
                    styles.packageCard,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isSelected ? Colors.primary : colors.border,
                      borderWidth: isSelected ? 2 : 1,
                    },
                  ]}>
                  <View style={styles.packageTopRow}>
                    <View style={styles.packageTitleWrap}>
                      <Text style={[styles.packageTitle, {color: colors.heading}]}>
                        {item.displayName}
                      </Text>
                      <Text
                        style={[
                          styles.packageSubtitle,
                          {color: colors.textSecondary},
                        ]}>
                        {formatCredits(item.baseCredit)} credit cơ bản
                      </Text>
                    </View>
                    <Icon
                      name={isSelected ? 'check-circle' : 'radiobox-blank'}
                      size={22}
                      color={isSelected ? Colors.primary : colors.textTertiary}
                    />
                  </View>

                  <View style={styles.packageBadgeRow}>
                    {isRecommended && (
                      <Badge label="Nổi bật" variant="info" size="sm" />
                    )}
                    {item.bonusCredit > 0 && (
                      <Badge
                        label={`Tặng ${formatCredits(item.bonusCredit)}`}
                        variant="warning"
                        size="sm"
                      />
                    )}
                  </View>

                  <View style={styles.packageMetrics}>
                    <View>
                      <Text style={[styles.metricLabel, {color: colors.textTertiary}]}>
                        Tổng nhận
                      </Text>
                      <Text style={[styles.metricValue, {color: colors.heading}]}>
                        {formatCredits(item.totalCredits)} credit
                      </Text>
                    </View>
                    <View style={styles.metricPriceWrap}>
                      <Text style={[styles.metricLabel, {color: colors.textTertiary}]}>
                        Thanh toán
                      </Text>
                      <Text style={[styles.metricPrice, {color: Colors.primary}]}>
                        {item.price.toLocaleString('vi-VN')}đ
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Phương thức thanh toán
        </Text>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setSelectedMethod('momo')}
          style={[
            styles.methodCard,
            {
              backgroundColor: colors.surface,
              borderColor:
                selectedMethod === 'momo' ? Colors.primary : colors.border,
              borderWidth: selectedMethod === 'momo' ? 2 : 1,
            },
          ]}>
          <View style={[styles.methodIcon, {backgroundColor: '#AE2070'}]}>
            <Text style={styles.methodIconText}>M</Text>
          </View>
          <View style={styles.methodCopy}>
            <Text style={[styles.methodTitle, {color: colors.heading}]}>
              MoMo
            </Text>
            <Text style={[styles.methodDesc, {color: colors.textSecondary}]}>
              Thanh toán nhanh bằng ví MoMo
            </Text>
          </View>
          <Icon
            name={
              selectedMethod === 'momo'
                ? 'radiobox-marked'
                : 'radiobox-blank'
            }
            size={22}
            color={
              selectedMethod === 'momo' ? Colors.primary : colors.textTertiary
            }
          />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setSelectedMethod('vnpay')}
          style={[
            styles.methodCard,
            {
              backgroundColor: colors.surface,
              borderColor:
                selectedMethod === 'vnpay' ? Colors.primary : colors.border,
              borderWidth: selectedMethod === 'vnpay' ? 2 : 1,
            },
          ]}>
          <View style={[styles.methodIcon, {backgroundColor: '#0A4FAF'}]}>
            <Text style={styles.methodIconText}>V</Text>
          </View>
          <View style={styles.methodCopy}>
            <Text style={[styles.methodTitle, {color: colors.heading}]}>
              VNPay
            </Text>
            <Text style={[styles.methodDesc, {color: colors.textSecondary}]}>
              Dùng app ngân hàng hoặc mã QR để thanh toán
            </Text>
          </View>
          <Icon
            name={
              selectedMethod === 'vnpay'
                ? 'radiobox-marked'
                : 'radiobox-blank'
            }
            size={22}
            color={
              selectedMethod === 'vnpay' ? Colors.primary : colors.textTertiary
            }
          />
        </TouchableOpacity>
      </ScrollView>

      <View
        style={[
          styles.footer,
          {backgroundColor: colors.surface, borderTopColor: colors.border},
        ]}>
        <View style={styles.footerCopy}>
          <Text style={[styles.footerLabel, {color: colors.textSecondary}]}>
            {selectedPackage ? selectedPackage.displayName : 'Chọn một gói credit'}
          </Text>
          <Text style={[styles.footerPrice, {color: colors.heading}]}>
            {selectedPackage
              ? `${selectedPackage.price.toLocaleString('vi-VN')}đ`
              : '—'}
          </Text>
        </View>
        <Button
          title={
            selectedPackage
              ? `Thanh toán ${selectedPackage.price.toLocaleString('vi-VN')}đ`
              : 'Chọn gói credit'
          }
          onPress={handlePayment}
          loading={processing}
          disabled={!selectedPackage || packages.length === 0}
          icon="arrow-right"
          iconPosition="right"
        />
      </View>
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
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['2xl'],
  },
  errorText: {
    fontSize: 13,
    marginBottom: Spacing.base,
  },
  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.base,
  },
  summaryIconWrap: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {flex: 1},
  summaryLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  breakdownList: {gap: Spacing.sm},
  breakdownItem: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
  },
  breakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  breakdownValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  breakdownMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  sectionHeader: {marginBottom: Spacing.md},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 19,
  },
  packageList: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  packageCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  packageTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.base,
  },
  packageTitleWrap: {flex: 1},
  packageTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  packageSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  packageBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  packageMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: Spacing.base,
    marginTop: Spacing.base,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  metricPriceWrap: {alignItems: 'flex-end'},
  metricPrice: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyState: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  methodCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    marginBottom: Spacing.md,
  },
  methodIcon: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  methodCopy: {flex: 1},
  methodTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  methodDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  footerCopy: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  footerLabel: {
    flex: 1,
    fontSize: 13,
  },
  footerPrice: {
    fontSize: 22,
    fontWeight: '700',
  },
});
