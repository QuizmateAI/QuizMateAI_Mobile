import React, {useMemo, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {
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
import FloatingInput from '../../components/ui/Input';
import ManagementSystemAPI from '../../api/ManagementSystemAPI';
import PaymentAPI from '../../api/PaymentAPI';
import WorkspaceAPI from '../../api/WorkspaceAPI';
import {
  EMPTY_CREDIT_SUMMARY,
  formatCredits,
  formatPlanDate,
  getCurrentPlanName,
} from '../../utils/accountSummary';

type PaymentMethod = 'momo' | 'vnpay' | 'stripe';
type ProcessingTarget = 'package' | 'custom' | null;

const PROVIDER_LABELS: Record<PaymentMethod, string> = {
  momo: 'MoMo',
  vnpay: 'VNPay',
  stripe: 'Stripe',
};

type CreditPackageItem = {
  id: number;
  displayName: string;
  baseCredit: number;
  bonusCredit: number;
  totalCredits: number;
  price: number;
};

type CustomCreditConfig = {
  unitPriceVnd: number;
  minUnits: number;
};

const DEFAULT_CUSTOM_CREDIT_CONFIG: CustomCreditConfig = {
  unitPriceVnd: 200,
  minUnits: 100,
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

const extractPaymentUrl = (response: any) =>
  response?.data?.payUrl ||
  response?.data?.url ||
  response?.data?.deeplink ||
  response?.data?.deepLink ||
  response?.data?.data?.payUrl ||
  response?.data?.data?.url;

const canBuyCreditFromPlan = (currentPlan: any) => {
  const entitlement = currentPlan?.plan?.entitlement || currentPlan?.entitlement;
  return entitlement?.canBuyCredit === true;
};

const getPlanValidityText = (currentPlan: any) => {
  if (currentPlan?.defaultPlan) {
    return 'Theo cấu hình gói';
  }

  const expiresAt = formatPlanDate(currentPlan?.expiresAt);
  return expiresAt || 'Theo cấu hình gói';
};

export default function CreditPackagesScreen({navigation, route}: any) {
  const workspaceId = Number(route?.params?.workspaceId || 0);
  const workspaceName = String(route?.params?.workspaceName || '');
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [creditSummary, setCreditSummary] = useState(EMPTY_CREDIT_SUMMARY);
  const [packages, setPackages] = useState<CreditPackageItem[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('momo');
  const [processingTarget, setProcessingTarget] = useState<ProcessingTarget>(null);
  const [customConfig, setCustomConfig] = useState<CustomCreditConfig>(
    DEFAULT_CUSTOM_CREDIT_CONFIG,
  );
  const [customConfigError, setCustomConfigError] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [customTouched, setCustomTouched] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;

      const loadData = async () => {
        setLoading(true);
        setLoadError(null);

        const currentPlanPromise =
          workspaceId > 0
            ? WorkspaceAPI.getCurrentPlan(workspaceId)
            : ManagementSystemAPI.getCurrentUserPlan();
        const walletPromise =
          workspaceId > 0
            ? ManagementSystemAPI.getGroupWorkspaceWallet(workspaceId)
            : ManagementSystemAPI.getMyWallet();

        const [planResult, walletResult, packageResult, configResult] =
          await Promise.allSettled([
            currentPlanPromise,
            walletPromise,
            ManagementSystemAPI.getPurchaseableCreditPackages(),
            ManagementSystemAPI.getCustomCreditConfig(),
          ]);

        if (!active) {
          return;
        }

        setCurrentPlan(planResult.status === 'fulfilled' ? planResult.value.data : null);
        setCreditSummary(
          walletResult.status === 'fulfilled'
            ? walletResult.value.data
            : EMPTY_CREDIT_SUMMARY,
        );

        if (packageResult.status === 'fulfilled') {
          const rawPackages = Array.isArray(packageResult.value.data?.data)
            ? packageResult.value.data.data
            : [];
          const normalizedPackages = rawPackages
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
              normalizedPackages.some(
                (item: CreditPackageItem) => item.id === currentSelectedId,
              )
            ) {
              return currentSelectedId;
            }

            return normalizedPackages[0]?.id ?? null;
          });
        } else {
          setPackages([]);
          setSelectedPackageId(null);
          setLoadError('Không thể tải danh sách gói credit.');
        }

        if (configResult.status === 'fulfilled') {
          setCustomConfig(
            configResult.value.data || DEFAULT_CUSTOM_CREDIT_CONFIG,
          );
          setCustomConfigError(false);
        } else {
          setCustomConfig(DEFAULT_CUSTOM_CREDIT_CONFIG);
          setCustomConfigError(true);
        }

        if (
          planResult.status !== 'fulfilled' &&
          walletResult.status !== 'fulfilled' &&
          packageResult.status !== 'fulfilled'
        ) {
          setLoadError('Không thể tải dữ liệu mua credit.');
        }

        setLoading(false);
      };

      loadData();

      return () => {
        active = false;
      };
    }, [workspaceId]),
  );

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
  const parsedCustomAmount = useMemo(() => {
    if (!customAmount) {
      return null;
    }

    const value = Number(customAmount);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return Math.floor(value);
  }, [customAmount]);
  const isBelowMin =
    parsedCustomAmount != null && parsedCustomAmount < customConfig.minUnits;
  const canSubmitCustom =
    parsedCustomAmount != null && parsedCustomAmount >= customConfig.minUnits;
  const customTotalPrice = canSubmitCustom
    ? Number(parsedCustomAmount || 0) * customConfig.unitPriceVnd
    : 0;
  const canBuyCredit = canBuyCreditFromPlan(currentPlan);
  const currentPlanName = loading ? 'Đang tải...' : getCurrentPlanName(currentPlan);
  const currentPlanValidity = getPlanValidityText(currentPlan);
  const creditExpiry = formatPlanDate(creditSummary.planCreditExpiresAt);

  const handleOpenPaymentLink = async (response: any, errorMessage: string) => {
    const payUrl = extractPaymentUrl(response);

    if (!payUrl) {
      showToast(errorMessage, 'error');
      return;
    }

    navigation.navigate('PaymentWebView', {
      paymentUrl: payUrl,
      provider: selectedMethod,
      purchaseType: 'credit',
      title: PROVIDER_LABELS[selectedMethod] || 'Thanh toán',
    });
  };

  const handlePackagePayment = async () => {
    if (!selectedPackage) {
      showToast('Vui lòng chọn gói credit', 'warning');
      return;
    }

    setProcessingTarget('package');

    try {
      const api =
        selectedMethod === 'momo'
          ? PaymentAPI.createMomoCreditPayment
          : selectedMethod === 'vnpay'
          ? PaymentAPI.createVnpayCreditPayment
          : PaymentAPI.createStripeCreditPayment;
      const response =
        workspaceId > 0
          ? await api(selectedPackage.id, workspaceId)
          : await api(selectedPackage.id);

      await handleOpenPaymentLink(
        response,
        'Không nhận được đường dẫn thanh toán.',
      );
    } catch {
      showToast('Không thể tạo thanh toán credit', 'error');
    } finally {
      setProcessingTarget(null);
    }
  };

  const handleCustomAmountChange = (value: string) => {
    if (value === '' || /^\d+$/.test(value)) {
      setCustomAmount(value);
    }
  };

  const handleCustomCreditPayment = async () => {
    if (!canSubmitCustom) {
      setCustomTouched(true);
      if (isBelowMin) {
        showToast(`Số credit tối thiểu là ${customConfig.minUnits}`, 'warning');
      } else {
        showToast('Vui lòng nhập số credit hợp lệ', 'warning');
      }
      return;
    }

    setProcessingTarget('custom');

    try {
      const api =
        selectedMethod === 'momo'
          ? PaymentAPI.createMomoCustomCreditPayment
          : selectedMethod === 'vnpay'
          ? PaymentAPI.createVnPayCustomCreditPayment
          : PaymentAPI.createStripeCustomCreditPayment;
      const response =
        workspaceId > 0
          ? await api(Number(parsedCustomAmount), workspaceId)
          : await api(Number(parsedCustomAmount));

      await handleOpenPaymentLink(
        response,
        'Không nhận được đường dẫn thanh toán.',
      );
    } catch {
      showToast('Không thể tạo thanh toán credit tùy chỉnh', 'error');
    } finally {
      setProcessingTarget(null);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="chevron-left" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>
          {workspaceId > 0 ? 'Nạp credit nhóm' : 'Mua credit'}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          canBuyCredit && packages.length > 0 && styles.scrollContentWithFooter,
        ]}
        showsVerticalScrollIndicator={false}>
        {loadError ? (
          <Text style={[styles.errorText, {color: Colors.error}]}>
            {loadError}
          </Text>
        ) : null}

        <View
          style={[
            styles.summaryCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          {workspaceId > 0 && workspaceName ? (
            <View
              style={[
                styles.scopeChip,
                {
                  backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
                  borderColor: isDark ? '#1D4ED8' : '#BFDBFE',
                },
              ]}>
              <Icon
                name="account-group-outline"
                size={16}
                color={isDark ? '#93C5FD' : Colors.primary}
              />
              <Text style={[styles.scopeChipText, {color: colors.textSecondary}]}>
                {workspaceName}
              </Text>
            </View>
          ) : null}

          <View style={styles.summaryTopRow}>
            <View style={styles.summaryTopCopy}>
              <Text style={[styles.summaryEyebrow, {color: colors.textTertiary}]}>
                GÓI HIỆN TẠI
              </Text>
              <Text style={[styles.summaryPlanName, {color: colors.heading}]}>
                {currentPlanName}
              </Text>
              <Text style={[styles.summaryPlanMeta, {color: colors.textSecondary}]}>
                Hiệu lực: {currentPlanValidity}
              </Text>
            </View>
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
                name="wallet-outline"
                size={22}
                color={isDark ? '#93C5FD' : Colors.primary}
              />
            </View>
          </View>

          <View style={styles.balanceRow}>
            <Text style={[styles.balanceValue, {color: colors.heading}]}>
              {formatCredits(creditSummary.totalAvailableCredits)}
            </Text>
            <Text style={[styles.balanceUnit, {color: colors.textSecondary}]}>
              credit
            </Text>
          </View>

          <View style={styles.balanceBreakdown}>
            <View
              style={[
                styles.balanceBreakdownCard,
                {
                  backgroundColor: isDark ? '#111827' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.balanceBreakdownLabel, {color: colors.textSecondary}]}>
                Credit thường
              </Text>
              <Text style={[styles.balanceBreakdownValue, {color: colors.heading}]}>
                {formatCredits(creditSummary.regularCreditBalance)}
              </Text>
            </View>

            <View
              style={[
                styles.balanceBreakdownCard,
                {
                  backgroundColor: isDark ? '#111827' : '#F8FAFC',
                  borderColor: colors.border,
                },
              ]}>
              <Text style={[styles.balanceBreakdownLabel, {color: colors.textSecondary}]}>
                Credit từ gói
              </Text>
              <Text style={[styles.balanceBreakdownValue, {color: colors.heading}]}>
                {formatCredits(creditSummary.planCreditBalance)}
              </Text>
              {creditExpiry ? (
                <Text style={[styles.balanceBreakdownMeta, {color: colors.textSecondary}]}>
                  Hết hạn: {creditExpiry}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        {!canBuyCredit ? (
          <View
            style={[
              styles.lockedCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <Icon
              name="information-outline"
              size={30}
              color={colors.textTertiary}
            />
            <Text style={[styles.lockedTitle, {color: colors.heading}]}>
              Gói hiện tại chưa hỗ trợ mua thêm credit
            </Text>
            <Text style={[styles.lockedDescription, {color: colors.textSecondary}]}>
              Hãy chọn gói phù hợp hơn nếu bạn cần nạp thêm credit để dùng AI.
            </Text>
            <Button
              title="Xem gói đăng ký"
              onPress={() =>
                navigation.navigate(
                  'Subscription',
                  workspaceId > 0
                    ? {
                        planType: 'group',
                        workspaceId,
                        workspaceName,
                      }
                    : undefined,
                )
              }
              icon="arrow-right"
              iconPosition="right"
              style={styles.lockedAction}
            />
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                Chọn gói credit
              </Text>
              <Text style={[styles.sectionDesc, {color: colors.textSecondary}]}>
                {workspaceId > 0
                  ? `Credit sẽ được cộng vào ví nhóm${workspaceName ? ` (${workspaceName})` : ''} sau khi thanh toán hoàn tất.`
                  : 'Credit sẽ được cộng vào ví cá nhân sau khi thanh toán hoàn tất.'}
              </Text>
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
                        {isRecommended ? (
                          <Badge label="Nổi bật" variant="info" size="sm" />
                        ) : null}
                        {item.bonusCredit > 0 ? (
                          <Badge
                            label={`Tặng ${formatCredits(item.bonusCredit)}`}
                            variant="warning"
                            size="sm"
                          />
                        ) : null}
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
                            {item.price.toLocaleString('vi-VN')} đ
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <View
              style={[
                styles.customCard,
                {backgroundColor: colors.surface, borderColor: colors.border},
              ]}>
              <View style={styles.customHeader}>
                <View style={styles.customTitleWrap}>
                  <Text
                    style={[
                      styles.sectionTitle,
                      styles.customTitle,
                      {color: colors.heading},
                    ]}>
                    Tự nhập số credit
                  </Text>
                  <Text
                    style={[
                      styles.sectionDesc,
                      styles.customDesc,
                      {color: colors.textSecondary},
                    ]}>
                    {customConfigError
                      ? 'Không tải được cấu hình mua credit, đang dùng cấu hình mặc định.'
                      : `Tối thiểu ${formatCredits(customConfig.minUnits)} credit • Đơn giá ${customConfig.unitPriceVnd.toLocaleString('vi-VN')} đ/credit`}
                  </Text>
                </View>
                <Icon
                  name="star-outline"
                  size={20}
                  color={isDark ? '#93C5FD' : Colors.primary}
                />
              </View>

              <View style={styles.customBadgeRow}>
                <Badge
                  label={`Tối thiểu ${formatCredits(customConfig.minUnits)} credit`}
                  variant="default"
                  size="sm"
                />
                <Badge
                  label={`${customConfig.unitPriceVnd.toLocaleString('vi-VN')} đ / credit`}
                  variant="info"
                  size="sm"
                />
              </View>

              <FloatingInput
                label="Số credit muốn mua"
                value={customAmount}
                onChangeText={handleCustomAmountChange}
                keyboardType="number-pad"
                onBlur={() => setCustomTouched(true)}
              />

              {customTouched && isBelowMin ? (
                <Text style={styles.customErrorText}>
                  Số credit tối thiểu là {formatCredits(customConfig.minUnits)}.
                </Text>
              ) : null}

              {canSubmitCustom ? (
                <View
                  style={[
                    styles.customPreview,
                    {
                      backgroundColor: isDark ? '#0F172A' : '#EFF6FF',
                      borderColor: isDark ? '#1E3A8A' : '#BFDBFE',
                    },
                  ]}>
                  <View style={styles.customPreviewRow}>
                    <View>
                      <Text style={[styles.previewLabel, {color: colors.textSecondary}]}>
                        Bạn sẽ nhận
                      </Text>
                      <Text style={[styles.previewValue, {color: colors.heading}]}>
                        {formatCredits(parsedCustomAmount)} credit
                      </Text>
                    </View>
                    <View style={styles.previewPriceWrap}>
                      <Text style={[styles.previewLabel, {color: colors.textSecondary}]}>
                        Tổng tiền
                      </Text>
                      <Text style={[styles.previewPrice, {color: Colors.primary}]}>
                        {customTotalPrice.toLocaleString('vi-VN')} đ
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.previewMeta, {color: colors.textSecondary}]}>
                    {formatCredits(parsedCustomAmount)} ×{' '}
                    {customConfig.unitPriceVnd.toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              ) : null}

              <Button
                title={
                  canSubmitCustom
                    ? `Mua ${formatCredits(parsedCustomAmount)} credit`
                    : 'Nhập số credit hợp lệ'
                }
                onPress={handleCustomCreditPayment}
                loading={processingTarget === 'custom'}
                disabled={!canSubmitCustom || processingTarget === 'package'}
                icon="arrow-right"
                iconPosition="right"
                style={styles.customActionBtn}
              />
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
                <Text style={[styles.methodTitle, {color: colors.heading}]}>MoMo</Text>
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
                  selectedMethod === 'momo'
                    ? Colors.primary
                    : colors.textTertiary
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
                <Text style={[styles.methodTitle, {color: colors.heading}]}>VNPay</Text>
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
                  selectedMethod === 'vnpay'
                    ? Colors.primary
                    : colors.textTertiary
                }
              />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedMethod('stripe')}
              style={[
                styles.methodCard,
                {
                  backgroundColor: colors.surface,
                  borderColor:
                    selectedMethod === 'stripe'
                      ? Colors.primary
                      : colors.border,
                  borderWidth: selectedMethod === 'stripe' ? 2 : 1,
                },
              ]}>
              <View style={[styles.methodIcon, {backgroundColor: '#635BFF'}]}>
                <Text style={styles.methodIconText}>S</Text>
              </View>
              <View style={styles.methodCopy}>
                <Text style={[styles.methodTitle, {color: colors.heading}]}>
                  Stripe
                </Text>
                <Text style={[styles.methodDesc, {color: colors.textSecondary}]}>
                  Thanh toán quốc tế qua Stripe Checkout
                </Text>
              </View>
              <Icon
                name={
                  selectedMethod === 'stripe'
                    ? 'radiobox-marked'
                    : 'radiobox-blank'
                }
                size={22}
                color={
                  selectedMethod === 'stripe'
                    ? Colors.primary
                    : colors.textTertiary
                }
              />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {canBuyCredit && packages.length > 0 ? (
        <View
          style={[
            styles.footer,
            {backgroundColor: colors.surface, borderTopColor: colors.border},
          ]}>
          <View style={styles.footerCopy}>
            <Text style={[styles.footerLabel, {color: colors.textSecondary}]}>
              {selectedPackage
                ? selectedPackage.displayName
                : 'Chọn một gói credit'}
            </Text>
            <Text style={[styles.footerPrice, {color: colors.heading}]}>
              {selectedPackage
                ? `${selectedPackage.price.toLocaleString('vi-VN')} đ`
                : '—'}
            </Text>
          </View>
          <Button
            title={
              selectedPackage
                ? `Thanh toán ${selectedPackage.price.toLocaleString('vi-VN')} đ`
                : 'Chọn gói credit'
            }
            onPress={handlePackagePayment}
            loading={processingTarget === 'package'}
            disabled={
              !selectedPackage ||
              packages.length === 0 ||
              processingTarget === 'custom'
            }
            icon="arrow-right"
            iconPosition="right"
          />
        </View>
      ) : null}
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
  scrollContentWithFooter: {
    paddingBottom: 140,
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
  scopeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 6,
    marginBottom: Spacing.base,
  },
  scopeChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.base,
  },
  summaryTopCopy: {flex: 1},
  summaryEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  summaryPlanName: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  summaryPlanMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  summaryIconWrap: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: Spacing.lg,
  },
  balanceValue: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 38,
  },
  balanceUnit: {
    fontSize: 14,
    marginBottom: 4,
  },
  balanceBreakdown: {
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  balanceBreakdownCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
  },
  balanceBreakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceBreakdownValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  balanceBreakdownMeta: {
    fontSize: 11,
    marginTop: 4,
  },
  lockedCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  lockedTitle: {
    marginTop: Spacing.md,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  lockedDescription: {
    marginTop: Spacing.sm,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  lockedAction: {
    marginTop: Spacing.lg,
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
  customCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.base,
  },
  customTitleWrap: {flex: 1},
  customTitle: {marginBottom: 0},
  customDesc: {marginBottom: 0},
  customBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
  },
  customErrorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 6,
  },
  customPreview: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.base,
    marginTop: Spacing.base,
  },
  customPreviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: Spacing.base,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  previewValue: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  previewPriceWrap: {alignItems: 'flex-end'},
  previewPrice: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  previewMeta: {
    fontSize: 12,
    marginTop: Spacing.sm,
  },
  customActionBtn: {marginTop: Spacing.base},
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
