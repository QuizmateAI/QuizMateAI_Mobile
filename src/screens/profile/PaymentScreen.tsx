import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
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
import PaymentAPI from '../../api/PaymentAPI';
import GroupAPI from '../../api/GroupAPI';

type PaymentMethod = 'momo' | 'vnpay';

export default function PaymentScreen({navigation, route}: any) {
  const {planId, planName, planType: paramPlanType} = route.params;
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('momo');
  const [processing, setProcessing] = useState(false);

  // Group selection for GROUP plans
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const isGroupPlan = plan?.type === 'GROUP' || paramPlanType === 'GROUP';

  useEffect(() => {
    const loadData = async () => {
      try {
        const planRes = await PaymentAPI.getPlan(planId);
        setPlan(planRes.data);
      } catch {
        setPlan(null);
        showToast('Không thể tải chi tiết gói', 'error');
      }

      // Load groups for GROUP plans
      try {
        const grRes = await GroupAPI.getJoined();
        setGroups(
          (grRes.data || []).filter(
            (g: any) => g.role === 'LEADER' || g.memberRole === 'LEADER',
          ),
        );
      } catch {
        setGroups([]);
      }

      setLoading(false);
    };
    loadData();
  }, [planId, planName, paramPlanType, showToast]);

  const handlePayment = async () => {
    if (!plan) {
      showToast('Gói hiện không khả dụng', 'error');
      return;
    }

    if (isGroupPlan && !selectedGroupId) {
      showToast('Vui lòng chọn nhóm trước', 'warning');
      return;
    }
    setProcessing(true);
    try {
      const api =
        selectedMethod === 'momo'
          ? PaymentAPI.createMomoPayment
          : PaymentAPI.createVnpayPayment;
      const res = await api(planId, selectedGroupId || undefined);
      const payUrl = res.data?.payUrl || res.data?.url;
      if (payUrl) {
        await Linking.openURL(payUrl);
      } else {
        showToast('Không nhận được đường dẫn thanh toán', 'error');
      }
    } catch {
      showToast('Không thể tạo thanh toán', 'error');
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
      edges={['top']}>
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
          Thanh toán
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Plan Info */}
        <View
          style={[
            styles.planCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.planHeader}>
            <View
              style={[
                styles.planIcon,
                {backgroundColor: isDark ? '#2563EB20' : '#EFF6FF'},
              ]}>
              <Icon
                name="crown"
                size={22}
                color={isDark ? '#60A5FA' : Colors.primary}
              />
            </View>
            <View style={styles.planHeaderInfo}>
              <Text style={[styles.planName, {color: colors.heading}]}>
                {plan?.name || planName}
              </Text>
              {isGroupPlan && (
                <Badge label="Group" variant="warning" size="sm" />
              )}
            </View>
          </View>
          <View style={styles.priceRow}>
            <Text style={[styles.planPrice, {color: Colors.primary}]}>
              {plan?.price?.toLocaleString() || '0'}đ
            </Text>
            <Text style={[styles.planPeriod, {color: colors.textSecondary}]}>
              /{plan?.duration || 'month'}
            </Text>
          </View>

          {/* Features */}
          {plan?.features && (
            <View style={styles.features}>
              {plan.features.map((f: string, i: number) => (
                <View key={i} style={styles.featureRow}>
                  <Icon name="check-circle" size={16} color={Colors.success} />
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
        </View>

        {/* ─── Group Selector (for GROUP plans) ─── */}
        {isGroupPlan && (
          <View>
            <View style={styles.groupSelectorHeader}>
              <Icon
                name="account-group"
                size={18}
                color={isDark ? '#F59E0B' : '#D97706'}
              />
              <Text style={[styles.sectionTitle, {color: colors.heading}]}>
                Chọn nhóm
              </Text>
            </View>
            <Text
              style={[styles.groupSelectDesc, {color: colors.textSecondary}]}>
              Chọn nhóm để áp dụng gói này
            </Text>

            {groups.length === 0 ? (
              <View
                style={[
                  styles.noGroupsCard,
                  {
                    backgroundColor: isDark
                      ? 'rgba(245,158,11,0.1)'
                      : '#FFFBEB',
                    borderColor: isDark ? '#92400E50' : '#FDE68A',
                  },
                ]}>
                <Icon
                  name="alert-outline"
                  size={18}
                  color={isDark ? '#F59E0B' : '#D97706'}
                />
                <Text
                  style={[
                    styles.noGroupsText,
                    {color: colors.textSecondary},
                  ]}>
                  Bạn phải là trưởng nhóm của ít nhất một nhóm để mua gói này
                </Text>
              </View>
            ) : (
              groups.map((g: any) => {
                const gId = g.groupId || g.id;
                const isSelected = selectedGroupId === gId;
                return (
                  <TouchableOpacity
                    key={gId}
                    onPress={() =>
                      setSelectedGroupId(isSelected ? null : gId)
                    }
                    style={[
                      styles.groupItem,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? '#2563EB15'
                            : '#EFF6FF'
                          : colors.surface,
                        borderColor: isSelected
                          ? Colors.primary
                          : colors.border,
                        borderWidth: isSelected ? 2 : 1,
                      },
                    ]}>
                    <Icon
                      name="account-group"
                      size={18}
                      color={isDark ? '#F59E0B' : '#D97706'}
                    />
                    <Text
                      style={[styles.groupName, {color: colors.heading}]}
                      numberOfLines={1}>
                      {g.groupName || g.name}
                    </Text>
                    <Text
                      style={[
                        styles.groupMemberCount,
                        {color: colors.textTertiary},
                      ]}>
                      {g.memberCount || 0} thành viên
                    </Text>
                    {isSelected && (
                      <Icon
                        name="check-circle"
                        size={18}
                        color={Colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {/* Payment Methods */}
        <Text style={[styles.sectionTitle, {color: colors.heading}]}>
          Phương thức thanh toán
        </Text>

        <TouchableOpacity
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
          <View style={styles.methodInfo}>
            <Text style={[styles.methodName, {color: colors.heading}]}>
              MoMo
            </Text>
            <Text style={[styles.methodSub, {color: colors.textSecondary}]}>
              Thanh toán bằng ví MoMo
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
          <View style={[styles.methodIcon, {backgroundColor: '#005BAA'}]}>
            <Text style={styles.methodIconText}>V</Text>
          </View>
          <View style={styles.methodInfo}>
            <Text style={[styles.methodName, {color: colors.heading}]}>
              VNPay
            </Text>
            <Text style={[styles.methodSub, {color: colors.textSecondary}]}>
              Thanh toán bằng VNPay
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

        {/* Order Summary */}
        <View
          style={[
            styles.summaryCard,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <Text style={[styles.summaryTitle, {color: colors.heading}]}>
            Tóm tắt đơn hàng
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, {color: colors.textSecondary}]}>
              {plan?.name || planName}
            </Text>
            <Text style={[styles.summaryValue, {color: colors.heading}]}>
              {plan?.price?.toLocaleString() || '0'}đ
            </Text>
          </View>
          <View
            style={[styles.summaryDivider, {backgroundColor: colors.border}]}
          />
          <View style={styles.summaryRow}>
            <Text style={[styles.totalLabel, {color: colors.heading}]}>
              Tổng cộng
            </Text>
            <Text style={[styles.totalValue, {color: Colors.primary}]}>
              {plan?.price?.toLocaleString() || '0'}đ
            </Text>
          </View>
        </View>

        <Button
          title={`Thanh toán ${plan?.price?.toLocaleString() || '0'}đ`}
          onPress={handlePayment}
          loading={processing}
          disabled={isGroupPlan && !selectedGroupId}
          style={styles.payBtn}
        />

        {/* Secure badge */}
        <View style={styles.secureRow}>
          <Icon name="lock" size={14} color={colors.textTertiary} />
          <Text style={[styles.secureText, {color: colors.textTertiary}]}>
            Bảo mật bằng mã hóa SSL
          </Text>
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

  // Plan card
  planCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  planHeader: {flexDirection: 'row', alignItems: 'center', gap: 12},
  planIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planHeaderInfo: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8},
  planName: {fontSize: 18, fontWeight: '700'},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: Spacing.sm,
  },
  planPrice: {fontSize: 28, fontWeight: '700'},
  planPeriod: {fontSize: 14, marginLeft: 4},
  features: {marginTop: Spacing.base, gap: 8},
  featureRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  featureText: {fontSize: 13, flex: 1},

  // Group Selector
  groupSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  groupSelectDesc: {fontSize: 12, marginBottom: Spacing.md},
  noGroupsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  noGroupsText: {fontSize: 13, flex: 1},
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: 10,
  },
  groupName: {flex: 1, fontSize: 14, fontWeight: '600'},
  groupMemberCount: {fontSize: 12},

  // Payment Methods
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
    gap: 14,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodIconText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  methodInfo: {flex: 1},
  methodName: {fontSize: 15, fontWeight: '600'},
  methodSub: {fontSize: 12, marginTop: 1},

  // Summary
  summaryCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  summaryTitle: {fontSize: 14, fontWeight: '600', marginBottom: Spacing.md},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {fontSize: 13},
  summaryValue: {fontSize: 13, fontWeight: '500'},
  summaryDivider: {height: StyleSheet.hairlineWidth, marginVertical: Spacing.md},
  totalLabel: {fontSize: 15, fontWeight: '700'},
  totalValue: {fontSize: 18, fontWeight: '700'},

  payBtn: {marginTop: Spacing.sm},

  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
  },
  secureText: {fontSize: 12},
});
