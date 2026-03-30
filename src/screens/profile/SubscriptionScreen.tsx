import React, {useState, useEffect} from 'react';
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
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import TabBar from '../../components/ui/TabBar';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PaymentAPI from '../../api/PaymentAPI';

const PLAN_TABS = [
  {key: 'individual', label: 'Cá nhân'},
  {key: 'group', label: 'Nhóm'},
];

export default function SubscriptionScreen({navigation}: any) {
  const {isDark, colors} = useTheme();
  const [planType, setPlanType] = useState('individual');
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    PaymentAPI.getPurchasablePlans(planType === 'group' ? 'GROUP' : 'INDIVIDUAL')
      .then(res => setPlans(res.data || []))
      .catch(() => {
        setPlans([]);
        setLoadError('Không thể tải danh sách gói đăng ký');
      })
      .finally(() => setLoading(false));
  }, [planType]);

  const filteredPlans = plans.filter(
    (p: any) => p.type?.toLowerCase() === planType,
  );

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
              <Text
                style={[
                  styles.currentPlanTitle,
                  {color: colors.heading},
                ]}>
                Gói hiện tại
              </Text>
              <Text
                style={[
                  styles.currentPlanDesc,
                  {color: colors.textSecondary},
                ]}>
                Gói đăng ký đang hoạt động của bạn
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.currentPlanBadgeRow,
              {
                backgroundColor: isDark
                  ? 'rgba(37,99,235,0.1)'
                  : '#EFF6FF',
                borderColor: isDark ? '#2563EB40' : '#BFDBFE',
              },
            ]}>
            <View style={styles.currentPlanBadgeLeft}>
              <Badge label="Free" variant="info" size="md" />
              <Text
                style={[
                  styles.currentPlanBadgeText,
                  {color: colors.textSecondary},
                ]}>
                Tính năng cơ bản với giới hạn sử dụng
              </Text>
            </View>
            <Text style={[styles.activeLabel, {color: colors.textTertiary}]}>
              Đang hoạt động
            </Text>
          </View>
        </View>

        {/* Plan Type Toggle */}
        <TabBar tabs={PLAN_TABS} activeTab={planType} onTabChange={setPlanType} />

        {/* Plans */}
        <View style={styles.plansContainer}>
          {filteredPlans.length === 0 ? (
            <View style={styles.emptyPlans}>
              <Icon name="tag-outline" size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
                Không có gói khả dụng
              </Text>
            </View>
          ) : (
            filteredPlans.map((plan: any) => (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: plan.recommended
                      ? Colors.primary
                      : colors.border,
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
                <View style={styles.priceRow}>
                  <Text style={[styles.planPrice, {color: colors.heading}]}>
                    {plan.price?.toLocaleString() || '0'}đ
                  </Text>
                  <Text
                    style={[
                      styles.planPeriod,
                      {color: colors.textSecondary},
                    ]}>
                    /{plan.duration || 'tháng'}
                  </Text>
                </View>

                {plan.features && (
                  <View style={styles.features}>
                    {plan.features.map((f: string, i: number) => (
                      <View key={i} style={styles.featureRow}>
                        <Icon
                          name="check-circle"
                          size={16}
                          color={Colors.success}
                        />
                        <Text
                          style={[
                            styles.featureText,
                            {color: colors.textSecondary},
                          ]}>
                          {f}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}

                <Button
                  title="Choose Plan"
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
              </View>
            ))
          )}
        </View>

        {/* Guarantee */}
        <View
          style={[
            styles.guarantee,
            {
              backgroundColor: isDark
                ? 'rgba(16,185,129,0.1)'
                : '#F0FDF4',
            },
          ]}>
          <Icon name="shield-check" size={20} color={Colors.success} />
          <View style={styles.guaranteeContent}>
            <Text
              style={[
                styles.guaranteeTitle,
                {color: isDark ? '#34D399' : '#059669'},
              ]}>
              Cam kết hoàn tiền trong 30 ngày
            </Text>
            <Text
              style={[
                styles.guaranteeDesc,
                {color: isDark ? '#6EE7B7' : '#047857'},
              ]}>
              Hoàn tiền nhanh gọn, không rườm rà
            </Text>
          </View>
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
  currentPlanBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  currentPlanBadgeText: {fontSize: 12, flex: 1},
  activeLabel: {fontSize: 11},

  // Plans
  plansContainer: {marginTop: Spacing.xl, gap: Spacing.base},
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

  emptyPlans: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: 8,
  },
  emptyText: {fontSize: 14},

  guarantee: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.xl,
    gap: 12,
  },
  guaranteeContent: {flex: 1},
  guaranteeTitle: {fontSize: 13, fontWeight: '600'},
  guaranteeDesc: {fontSize: 11, marginTop: 2},
});
