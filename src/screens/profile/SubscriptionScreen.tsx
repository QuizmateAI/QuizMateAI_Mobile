import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {getPlanFeatureLabel} from '../../utils/uiText';
import TabBar from '../../components/ui/TabBar';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PaymentAPI from '../../api/PaymentAPI';
import ManagementSystemAPI from '../../api/ManagementSystemAPI';
import {
  EMPTY_CREDIT_SUMMARY,
  formatCredits,
  formatPlanDate,
  getCurrentPlanName,
  getCurrentPlanSubtitle,
} from '../../utils/accountSummary';

const PLAN_TABS = [
  {key: 'individual', label: 'Cá nhân'},
  // {key: 'group', label: 'Nhóm'},
];

export default function SubscriptionScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const {width: screenWidth} = useWindowDimensions();
  const [planType, setPlanType] = useState('individual');
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [creditSummary, setCreditSummary] = useState(EMPTY_CREDIT_SUMMARY);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const CARD_HORIZONTAL_PADDING = Spacing.lg * 2;
  const cardWidth = screenWidth - CARD_HORIZONTAL_PADDING;

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    setActivePlanIndex(0);
    PaymentAPI.getPurchasablePlans(planType === 'group' ? 'GROUP' : 'INDIVIDUAL')
      .then(res => setPlans(res.data || []))
      .catch(() => {
        setPlans([]);
        setLoadError('Không thể tải danh sách gói đăng ký');
      })
      .finally(() => setLoading(false));
  }, [planType]);

  useEffect(() => {
    let mounted = true;
    const loadSummary = async () => {
      setLoadingSummary(true);
      const [planResult, creditResult] = await Promise.allSettled([
        ManagementSystemAPI.getCurrentUserPlan(),
        ManagementSystemAPI.getMyWallet(),
      ]);
      if (!mounted) {return;}
      setCurrentPlan(
        planResult.status === 'fulfilled' ? planResult.value.data : null,
      );
      setCreditSummary(
        creditResult.status === 'fulfilled'
          ? creditResult.value.data
          : EMPTY_CREDIT_SUMMARY,
      );
      setLoadingSummary(false);
    };
    loadSummary();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredPlans = plans.filter(
    (p: any) => p.type?.toLowerCase() === planType,
  );
  const currentPlanName = loadingSummary ? 'Đang tải...' : getCurrentPlanName(currentPlan);
  const currentPlanSubtitle = loadingSummary
    ? 'Đang cập nhật thông tin gói'
    : getCurrentPlanSubtitle(currentPlan);
  const creditExpiry = formatPlanDate(creditSummary.planCreditExpiresAt);

  if (loading) {
    return <LoadingSpinner />;
  }

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
          Gói đăng ký
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>

        {/* ──── Current Plan Card ──── */}
        <View
          style={[
            styles.currentPlanCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          {!!loadError && (
            <Text style={[styles.errorText, {color: '#EF4444'}]}>{loadError}</Text>
          )}
          <View style={styles.currentPlanHeader}>
            <View
              style={[
                styles.currentPlanIcon,
                {backgroundColor: isDark ? '#2563EB20' : '#DBEAFE'},
              ]}>
              <Icon
                name="crown"
                size={20}
                color={isDark ? '#60A5FA' : Colors.primary}
              />
            </View>
            <View>
              <Text style={[styles.currentPlanTitle, {color: colors.heading}]}>
                Gói hiện tại
              </Text>
              <Text style={[styles.currentPlanDesc, {color: colors.textSecondary}]}>
                Gói đăng ký đang hoạt động của bạn
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.currentPlanBadgeRow,
              {
                backgroundColor: isDark ? 'rgba(37,99,235,0.1)' : '#EFF6FF',
                borderColor: isDark ? '#2563EB40' : '#BFDBFE',
              },
            ]}>
            <View style={styles.currentPlanBadgeLeft}>
              <View style={styles.currentPlanCopy}>
                <View style={styles.currentPlanNameRow}>
                  <Badge label={currentPlanName} variant="info" size="md" />
                  {!!currentPlan?.defaultPlan && (
                    <Badge label="Mặc định" variant="warning" size="sm" />
                  )}
                </View>
                <Text
                  style={[styles.currentPlanBadgeText, {color: colors.textSecondary}]}>
                  {currentPlanSubtitle}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.creditSummaryCard,
              {
                backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                borderColor: colors.border,
              },
            ]}>
            <View style={styles.creditSummaryTopRow}>
              <View style={styles.creditSummaryBlock}>
                <Text style={[styles.creditSummaryLabel, {color: colors.textTertiary}]}>
                  Số dư credit
                </Text>
                <Text style={[styles.creditSummaryValue, {color: colors.heading}]}>
                  {loadingSummary ? '...' : formatCredits(creditSummary.totalAvailableCredits)}
                </Text>
              </View>
            </View>
            <View style={styles.creditSummaryList}>
              <View
                style={[
                  styles.creditSummaryItem,
                  {
                    backgroundColor: isDark ? '#111827' : '#FFFFFF',
                    borderColor: colors.border,
                  },
                ]}>
                <View style={styles.creditSummaryItemHeader}>
                  <Icon name="cart-outline" size={16} color={isDark ? '#93C5FD' : Colors.primary} />
                  <Text style={[styles.creditSummaryItemLabel, {color: colors.textSecondary}]}>
                    Credit mua riêng
                  </Text>
                </View>
                <Text style={[styles.creditSummaryValueSmall, {color: colors.heading}]}>
                  {loadingSummary ? '...' : formatCredits(creditSummary.regularCreditBalance)}
                </Text>
              </View>

              <View
                style={[
                  styles.creditSummaryItem,
                  {
                    backgroundColor: isDark ? '#111827' : '#FFFFFF',
                    borderColor: colors.border,
                  },
                ]}>
                <View style={styles.creditSummaryItemHeader}>
                  <Icon name="crown-outline" size={16} color={isDark ? '#FBBF24' : '#D97706'} />
                  <Text style={[styles.creditSummaryItemLabel, {color: colors.textSecondary}]}>
                    Credit từ gói
                  </Text>
                </View>
                <Text style={[styles.creditSummaryValueSmall, {color: colors.heading}]}>
                  {loadingSummary ? '...' : formatCredits(creditSummary.planCreditBalance)}
                </Text>
                {!!creditExpiry && (
                  <Text style={[styles.creditSummaryMeta, {color: colors.textSecondary}]}>
                    Hết hạn vào {creditExpiry}
                  </Text>
                )}
              </View>
            </View>
            <Button
              title="Mua credit"
              variant="secondary"
              size="md"
              onPress={() => navigation.navigate('CreditPackages')}
              icon="lightning-bolt"
              style={styles.creditActionBtn}
            />
          </View>
        </View>

        {/* Plan Type Toggle */}
        {/* <TabBar tabs={PLAN_TABS} activeTab={planType} onTabChange={setPlanType} /> */}

        {/* Plans Carousel */}
        <View style={styles.carouselWrapper}>
          {filteredPlans.length === 0 ? (
            <View style={styles.emptyPlans}>
              <Icon name="tag-outline" size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                Không có gói khả dụng
              </Text>
            </View>
          ) : (
            <>
              <FlatList
                ref={flatListRef}
                data={filteredPlans}
                keyExtractor={item => String(item.id)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                snapToAlignment="center"
                decelerationRate="fast"
                onMomentumScrollEnd={e => {
                  const index = Math.round(
                    e.nativeEvent.contentOffset.x / cardWidth,
                  );
                  setActivePlanIndex(index);
                }}
                renderItem={({item: plan}) => (
                  <View style={[{width: cardWidth}, styles.planCardWrap]}>
                    <View
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: plan.recommended ? Colors.primary : colors.border,
                          borderWidth: plan.recommended ? 2 : 1,
                        },
                      ]}>
                      {plan.recommended && (
                        <View style={styles.recommendedRow}>
                          <Badge label="Recommended" variant="info" size="sm" />
                          <Icon name="star" size={14} color={Colors.primary} />
                        </View>
                      )}
                      <Text style={[styles.planName, {color: colors.heading}]}>
                        {plan.name}
                      </Text>
                      {(plan.price ?? 0) > 0 && (
                        <View style={styles.priceRow}>
                          <Text style={[styles.planPrice, {color: colors.heading}]}>
                            {plan.price?.toLocaleString()}đ
                          </Text>
                          <Text style={[styles.planPeriod, {color: colors.textSecondary}]}>
                            /{plan.durationLabel || plan.duration || 'tháng'}
                          </Text>
                        </View>
                      )}

                      {plan.features && (
                        <View style={styles.features}>
                          {plan.features.map((f: string, i: number) => (
                            <View key={i} style={styles.featureRow}>
                              <Icon name="check-circle" size={16} color={Colors.success} />
                              <Text style={[styles.featureText, {color: colors.textSecondary}]}>
                                {getPlanFeatureLabel(f)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {(plan.price ?? 0) > 0 && (
                        <Button
                          title="Chọn gói"
                          variant={plan.recommended ? 'primary' : 'outline'}
                          size="md"
                          onPress={() =>
                            navigation.navigate('Payment', {
                              planId: plan.id,
                              planName: plan.name,
                              planType: plan.type,
                            })
                          }
                          style={styles.planBtn}
                        />
                      )}
                    </View>
                  </View>
                )}
              />

              {/* Dot indicators */}
              {filteredPlans.length > 1 && (
                <View style={styles.dots}>
                  {filteredPlans.map((_: any, i: number) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            i === activePlanIndex
                              ? Colors.primary
                              : colors.border,
                          width: i === activePlanIndex ? 20 : 6,
                        },
                      ]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </View>
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
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {padding: Spacing.sm, width: 42},
  headerTitle: {fontSize: 17, fontWeight: '600'},
  scrollContent: {padding: Spacing.lg, paddingBottom: 40},

  // Current Plan
  currentPlanCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  errorText: {fontSize: 12, marginBottom: Spacing.sm},
  currentPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.md,
  },
  currentPlanIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentPlanTitle: {fontSize: 15, fontWeight: '600'},
  currentPlanDesc: {fontSize: 12, marginTop: 1},
  currentPlanBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  currentPlanBadgeLeft: {flex: 1},
  currentPlanCopy: {flex: 1},
  currentPlanNameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  currentPlanBadgeText: {fontSize: 12, marginTop: 8},
  creditSummaryCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  creditSummaryTopRow: {marginBottom: Spacing.md},
  creditSummaryBlock: {flex: 1},
  creditSummaryLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  creditSummaryValue: {fontSize: 26, fontWeight: '700', marginTop: 6},
  creditSummaryList: {gap: Spacing.sm},
  creditSummaryItem: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  creditSummaryItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  creditSummaryItemLabel: {fontSize: 12, fontWeight: '600'},
  creditSummaryValueSmall: {fontSize: 20, fontWeight: '700', marginTop: 8},
  creditSummaryMeta: {fontSize: 11, marginTop: 4, lineHeight: 16},
  creditActionBtn: {marginTop: Spacing.base},

  // Carousel
  carouselWrapper: {marginTop: Spacing.xl},
  planCardWrap: {paddingHorizontal: 2},
  planCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  recommendedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  planName: {fontSize: 18, fontWeight: '700'},
  priceRow: {flexDirection: 'row', alignItems: 'baseline', marginTop: 4},
  planPrice: {fontSize: 28, fontWeight: '700'},
  planPeriod: {fontSize: 14, marginLeft: 4},
  features: {marginTop: Spacing.base, gap: 8},
  featureRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  featureText: {fontSize: 13, flex: 1},
  planBtn: {marginTop: Spacing.lg},

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },

  emptyPlans: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: 8,
  },
  emptyText: {fontSize: 14},
});
