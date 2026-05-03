import React, {useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Image,
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
import {getPlanFeatureLabel} from '../../utils/uiText';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PaymentAPI from '../../api/PaymentAPI';
import GroupAPI from '../../api/GroupAPI';

type PaymentMethod = 'momo' | 'vnpay' | 'stripe';

const momoLogo = require('../../assets/MOMO-Logo.png');
const vnpayLogo = require('../../assets/Logo-VNPAY-QR-1.webp');

const PROVIDER_LABELS: Record<PaymentMethod, string> = {
  momo: 'MoMo',
  vnpay: 'VNPay',
  stripe: 'Stripe',
};

const PAYMENT_METHODS: Array<{
  id: PaymentMethod;
  label: string;
  description: string;
  logo?: any;
}> = [
  {
    id: 'momo',
    label: 'MoMo wallet',
    description: 'Hoàn tất giao dịch an toàn bằng ví MoMo.',
    logo: momoLogo,
  },
  {
    id: 'vnpay',
    label: 'VNPay QR',
    description: 'Thanh toán nhanh bằng VNPay QR hoặc ngân hàng nội địa.',
    logo: vnpayLogo,
  },
  {
    id: 'stripe',
    label: 'Stripe checkout',
    description: 'Thanh toán quốc tế an toàn qua Stripe Checkout.',
  },
];

const getWorkspaceId = (item: any) =>
  Number(item?.workspaceId ?? item?.groupId ?? item?.id ?? 0);

const getWorkspaceName = (item: any) =>
  item?.displayName ?? item?.groupName ?? item?.name ?? 'Nhóm';

const extractPaymentUrl = (payload: any) =>
  payload?.data?.payUrl ||
  payload?.data?.url ||
  payload?.data?.deeplink ||
  payload?.data?.deepLink ||
  payload?.data?.data?.payUrl ||
  payload?.data?.data?.url;

const formatNumber = (value: any) =>
  new Intl.NumberFormat('vi-VN').format(Number(value) || 0);

const formatCurrency = (value: any) => `${formatNumber(value)}đ`;

const normalizePlanScope = (value: any) => {
  const scope = String(value || '').toUpperCase();
  if (scope === 'WORKSPACE' || scope === 'GROUP_WORKSPACE') {
    return 'GROUP';
  }
  if (scope === 'USER') {
    return 'INDIVIDUAL';
  }
  return scope;
};

const formatLimitValue = (value: any) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 999999) {
      return 'Không giới hạn';
    }
    return formatNumber(numeric);
  }
  return String(value);
};

const buildPlanLimits = (plan: any) => {
  const entitlement = plan?.entitlement || {};
  const rawLimits = [
    {
      key: 'workspace',
      icon: 'layers-outline',
      label: 'Không gian học tập tối đa',
      value: entitlement?.maxIndividualWorkspace ?? entitlement?.maxWorkspace,
    },
    {
      key: 'materials',
      icon: 'file-document-outline',
      label: 'Tài liệu / Không gian học tập',
      value:
        entitlement?.maxMaterialInWorkspace ??
        entitlement?.maxMaterialPerWorkspace,
    },
    {
      key: 'quiz',
      icon: 'star-four-points-outline',
      label: 'Quiz AI / ngày',
      value: entitlement?.maxAiCreateQuizPerDay,
    },
    {
      key: 'members',
      icon: 'account-group-outline',
      label: 'Slot thành viên',
      value: entitlement?.maxMemberSlot,
    },
  ];

  return rawLimits.filter(item => {
    if (item.value == null || item.value === false || item.value === '') {
      return false;
    }
    if (Number.isFinite(Number(item.value)) && Number(item.value) <= 0) {
      return false;
    }
    return true;
  });
};

const normalizeFeatureText = (value: any) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const getFeatureIconName = (feature: any) => {
  const text = normalizeFeatureText(feature);

  if (text.includes('pdf')) {
    return 'file-document-outline';
  }
  if (text.includes('word')) {
    return 'file-word-outline';
  }
  if (text.includes('slide') || text.includes('presentation')) {
    return 'presentation';
  }
  if (text.includes('excel')) {
    return 'file-excel-outline';
  }
  if (text.includes('text') || text.includes('van ban')) {
    return 'text-box-outline';
  }
  if (text.includes('image') || text.includes('hinh anh')) {
    return 'image-outline';
  }
  if (text.includes('audio')) {
    return 'headphones';
  }
  if (text.includes('video')) {
    return 'video-outline';
  }
  if (text.includes('lo trinh') || text.includes('roadmap')) {
    return 'map-outline';
  }
  if (text.includes('tom tat') || text.includes('summary')) {
    return 'text-box-search-outline';
  }
  if (
    text.includes('danh gia') ||
    text.includes('assessment') ||
    text.includes('goi y')
  ) {
    return 'clipboard-check-outline';
  }
  if (text.includes('phan tich') || text.includes('analytics')) {
    return 'chart-box-outline';
  }
  if (text.includes('cau hinh') || text.includes('advanced')) {
    return 'tune-variant';
  }

  return 'star-four-points-outline';
};

export default function PaymentScreen({navigation, route}: any) {
  const {
    planId,
    planName,
    planType: paramPlanType,
    workspaceId: preselectedWorkspaceId,
    workspaceName: preselectedWorkspaceName,
  } = route.params || {};
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [processing, setProcessing] = useState(false);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<number | null>(
    Number(preselectedWorkspaceId || 0) > 0
      ? Number(preselectedWorkspaceId)
      : null,
  );
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState(
    String(preselectedWorkspaceName || ''),
  );

  const normalizedPlanType = normalizePlanScope(
    plan?.type || paramPlanType || '',
  );
  const isGroupPlan = normalizedPlanType === 'GROUP';
  const hasLockedWorkspace = Number(preselectedWorkspaceId || 0) > 0;
  const paymentWorkspaceId = useMemo(
    () =>
      hasLockedWorkspace
        ? Number(preselectedWorkspaceId || 0)
        : Number(selectedWorkspaceId || 0),
    [hasLockedWorkspace, preselectedWorkspaceId, selectedWorkspaceId],
  );

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setLoading(true);
      setLoadError('');

      if (!planId) {
        setPlan(null);
        setLoadError('Thiếu thông tin gói cần thanh toán.');
        setLoading(false);
        return;
      }

      try {
        const planRes = await PaymentAPI.getPlan(planId);
        if (!active) {
          return;
        }

        const fetchedPlan = planRes.data;
        const fetchedScope = normalizePlanScope(
          fetchedPlan?.type || paramPlanType || '',
        );
        const shouldLoadWorkspaces = fetchedScope === 'GROUP';
        setPlan(fetchedPlan);

        if (shouldLoadWorkspaces) {
          try {
            const joinedRes = await GroupAPI.getJoined();
            if (!active) {
              return;
            }

            const leaderWorkspaces = (joinedRes.data || []).filter(
              (item: any) =>
                item.role === 'LEADER' || item.memberRole === 'LEADER',
            );
            setWorkspaces(leaderWorkspaces);

            const lockedId = Number(preselectedWorkspaceId || 0);
            if (lockedId > 0) {
              const matched = leaderWorkspaces.find(
                (item: any) => getWorkspaceId(item) === lockedId,
              );
              setSelectedWorkspaceId(lockedId);
              if (matched) {
                setSelectedWorkspaceName(getWorkspaceName(matched));
              }
            } else if (leaderWorkspaces.length === 1) {
              const onlyWorkspace = leaderWorkspaces[0];
              setSelectedWorkspaceId(getWorkspaceId(onlyWorkspace));
              setSelectedWorkspaceName(getWorkspaceName(onlyWorkspace));
            }
          } catch {
            if (!active) {
              return;
            }
            setWorkspaces([]);
          }
        } else {
          setWorkspaces([]);
        }
      } catch {
        if (!active) {
          return;
        }
        setPlan(null);
        setLoadError('Không thể tải chi tiết gói.');
        showToast('Không thể tải chi tiết gói', 'error');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [planId, paramPlanType, preselectedWorkspaceId, showToast]);

  const planPrice = Number(plan?.price || 0);
  const displayPlanName = plan?.name || plan?.planName || planName || 'Gói học';
  const displayDuration = plan?.durationLabel || 'không giới hạn';
  const displayStatus = String(plan?.status || 'ACTIVE').toUpperCase();
  const displayScope = isGroupPlan ? 'GROUP' : 'INDIVIDUAL';
  const planLimits = useMemo(() => buildPlanLimits(plan), [plan]);
  const planFeatures = Array.isArray(plan?.features) ? plan.features : [];
  const visibleFeatures = planFeatures;
  const bonusCredit = Number(plan?.entitlement?.bonusCreditOnPlanPurchase || 0);
  const appliedWorkspaceName =
    selectedWorkspaceName ||
    preselectedWorkspaceName ||
    (paymentWorkspaceId > 0 ? `#${paymentWorkspaceId}` : '');
  const needGroupSelect = isGroupPlan && paymentWorkspaceId <= 0;
  const payDisabled =
    processing || !selectedMethod || needGroupSelect || planPrice <= 0;

  const handlePayment = async () => {
    if (!plan) {
      showToast('Gói hiện không khả dụng', 'error');
      return;
    }

    if (!selectedMethod) {
      showToast('Vui lòng chọn phương thức thanh toán', 'warning');
      return;
    }

    if (needGroupSelect) {
      showToast('Vui lòng chọn nhóm trước', 'warning');
      return;
    }

    setProcessing(true);
    try {
      const api =
        selectedMethod === 'momo'
          ? PaymentAPI.createMomoPayment
          : selectedMethod === 'vnpay'
          ? PaymentAPI.createVnpayPayment
          : PaymentAPI.createStripePayment;
      const response = await api(
        planId,
        isGroupPlan && paymentWorkspaceId > 0 ? paymentWorkspaceId : undefined,
      );
      const payUrl = extractPaymentUrl(response);

      if (!payUrl) {
        showToast('Không nhận được đường dẫn thanh toán', 'error');
        return;
      }

      navigation.navigate('PaymentWebView', {
        paymentUrl: payUrl,
        provider: selectedMethod,
        purchaseType: 'plan',
        title: PROVIDER_LABELS[selectedMethod] || 'Thanh toán',
      });
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
      style={[
        styles.container,
        {backgroundColor: isDark ? '#020617' : '#F8FBFF'},
      ]}
      edges={['top']}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? 'rgba(15,23,42,0.96)' : '#FFFFFF',
            borderBottomColor: isDark ? '#1E293B' : '#E2E8F0',
          },
        ]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}>
          <Icon name="chevron-left" size={28} color={colors.icon} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, {color: colors.heading}]}>
          Thanh toán
        </Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {loadError || !plan ? (
          <View
            style={[
              styles.errorCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}>
            <Icon name="alert-circle-outline" size={34} color={Colors.error} />
            <Text style={[styles.errorTitle, {color: colors.heading}]}>
              Không thể mở thanh toán
            </Text>
            <Text style={[styles.errorText, {color: colors.textSecondary}]}>
              {loadError || 'Không tìm thấy thông tin gói.'}
            </Text>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.planInfoCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}>
              <View style={styles.planAccentBar} />
              <View style={styles.planInfoBody}>
                <View style={styles.planInfoHeader}>
                  <Text style={[styles.panelTitle, {color: colors.heading}]}>
                    Thông tin gói
                  </Text>
                  <View
                    style={[
                      styles.statusPill,
                      {
                        backgroundColor: isDark
                          ? 'rgba(16,185,129,0.15)'
                          : '#ECFDF5',
                        borderColor: isDark
                          ? 'rgba(16,185,129,0.30)'
                          : '#A7F3D0',
                      },
                    ]}>
                    <Icon
                      name="check"
                      size={14}
                      color={isDark ? '#34D399' : '#047857'}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        {color: isDark ? '#34D399' : '#047857'},
                      ]}>
                      {displayStatus}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.planPreviewCard,
                    {
                      backgroundColor: isDark
                        ? 'rgba(30,64,175,0.22)'
                        : '#EFF6FF',
                      borderColor: isDark
                        ? 'rgba(96,165,250,0.22)'
                        : '#DBEAFE',
                    },
                  ]}>
                  <View style={styles.planPreviewTop}>
                    <View style={styles.planNameRow}>
                      <Icon
                        name="credit-card-outline"
                        size={21}
                        color={isDark ? '#60A5FA' : Colors.primary}
                      />
                      <Text
                        style={[
                          styles.planName,
                          {color: isDark ? '#F8FAFC' : '#1E293B'},
                        ]}
                        numberOfLines={2}>
                        {displayPlanName}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.scopeBadge,
                        {
                          backgroundColor: isDark
                            ? 'rgba(59,130,246,0.20)'
                            : '#DBEAFE',
                        },
                      ]}>
                      <Text
                        style={[
                          styles.scopeBadgeText,
                          {color: isDark ? '#93C5FD' : '#1D4ED8'},
                        ]}>
                        {displayScope}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.planPrice,
                      {color: isDark ? '#60A5FA' : Colors.primary},
                    ]}>
                    {formatCurrency(planPrice)}
                  </Text>
                  <View style={styles.durationRow}>
                    <Icon
                      name="calendar-outline"
                      size={15}
                      color={colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.durationText,
                        {color: colors.textSecondary},
                      ]}>
                      {displayDuration}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailGrid}>
                  <View
                    style={[
                      styles.detailPanel,
                      {backgroundColor: isDark ? '#1E293B' : '#F8FAFC'},
                    ]}>
                    <Text
                      style={[
                        styles.detailPanelTitle,
                        {color: isDark ? '#64748B' : '#94A3B8'},
                      ]}>
                      Giới hạn
                    </Text>
                    {planLimits.length > 0 ? (
                      planLimits.map(item => (
                        <View key={item.key} style={styles.detailRow}>
                          <View
                            style={[
                              styles.detailIconWrap,
                              {
                                backgroundColor: isDark
                                  ? 'rgba(59,130,246,0.15)'
                                  : '#DBEAFE',
                              },
                            ]}>
                            <Icon
                              name={item.icon}
                              size={15}
                              color={isDark ? '#60A5FA' : Colors.primary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.detailLabel,
                              {color: colors.textSecondary},
                            ]}>
                            {item.label}
                          </Text>
                          <Text
                            style={[
                              styles.detailValue,
                              {color: colors.heading},
                            ]}>
                            {formatLimitValue(item.value)}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text
                        style={[
                          styles.detailEmptyText,
                          {color: colors.textSecondary},
                        ]}>
                        Theo cấu hình gói
                      </Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.detailPanel,
                      {backgroundColor: isDark ? '#1E293B' : '#F8FAFC'},
                    ]}>
                    <Text
                      style={[
                        styles.detailPanelTitle,
                        {color: isDark ? '#64748B' : '#94A3B8'},
                      ]}>
                      Tính năng
                    </Text>
                    {visibleFeatures.length > 0 ? (
                      visibleFeatures.map((feature: string, index: number) => (
                        <View key={`${feature}-${index}`} style={styles.detailRow}>
                          <View
                            style={[
                              styles.detailIconWrap,
                              {
                                backgroundColor: isDark
                                  ? 'rgba(16,185,129,0.15)'
                                  : '#D1FAE5',
                              },
                            ]}>
                            <Icon
                              name={getFeatureIconName(feature)}
                              size={15}
                              color={isDark ? '#34D399' : '#059669'}
                            />
                          </View>
                          <Text
                            style={[
                              styles.detailLabel,
                              {color: colors.textSecondary},
                            ]}>
                            {getPlanFeatureLabel(feature)}
                          </Text>
                          <Icon
                            name="check-circle-outline"
                            size={17}
                            color="#10B981"
                          />
                        </View>
                      ))
                    ) : (
                      <Text
                        style={[
                          styles.detailEmptyText,
                          {color: colors.textSecondary},
                        ]}>
                        Theo cấu hình gói
                      </Text>
                    )}
                  </View>
                </View>

                {bonusCredit > 0 ? (
                  <View
                    style={[
                      styles.bonusCard,
                      {
                        backgroundColor: isDark
                          ? 'rgba(245,158,11,0.10)'
                          : '#FFFBEB',
                        borderColor: isDark
                          ? 'rgba(245,158,11,0.24)'
                          : '#FDE68A',
                      },
                    ]}>
                    <Icon
                      name="gift-outline"
                      size={20}
                      color={isDark ? '#FBBF24' : '#D97706'}
                    />
                    <Text
                      style={[
                        styles.bonusText,
                        {color: isDark ? '#FCD34D' : '#92400E'},
                      ]}>
                      Tặng {formatNumber(bonusCredit)} credit khi mua gói này
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {isGroupPlan ? (
              <View
                style={[
                  styles.groupCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}>
                <View style={styles.groupHeader}>
                  <Icon
                    name="account-group-outline"
                    size={21}
                    color={isDark ? '#FBBF24' : '#D97706'}
                  />
                  <Text style={[styles.groupTitle, {color: colors.heading}]}>
                    Chọn nhóm
                  </Text>
                </View>
                <Text
                  style={[styles.groupDescription, {color: colors.textSecondary}]}>
                  Chọn nhóm để áp dụng gói này.
                </Text>

                {hasLockedWorkspace ? (
                  <View
                    style={[
                      styles.groupItem,
                      styles.groupItemSelected,
                      {
                        backgroundColor: isDark
                          ? 'rgba(37,99,235,0.15)'
                          : '#EFF6FF',
                      },
                    ]}>
                    <Icon
                      name="account-group-outline"
                      size={18}
                      color={isDark ? '#FBBF24' : '#D97706'}
                    />
                    <Text
                      style={[styles.groupName, {color: colors.heading}]}
                      numberOfLines={1}>
                      {appliedWorkspaceName || 'Nhóm hiện tại'}
                    </Text>
                    <Icon name="check-circle" size={18} color={Colors.primary} />
                  </View>
                ) : workspaces.length === 0 ? (
                  <View
                    style={[
                      styles.noGroupsCard,
                      {
                        backgroundColor: isDark
                          ? 'rgba(245,158,11,0.10)'
                          : '#FFFBEB',
                        borderColor: isDark
                          ? 'rgba(245,158,11,0.35)'
                          : '#FDE68A',
                      },
                    ]}>
                    <Icon
                      name="alert-outline"
                      size={18}
                      color={isDark ? '#FBBF24' : '#D97706'}
                    />
                    <Text
                      style={[
                        styles.noGroupsText,
                        {color: colors.textSecondary},
                      ]}>
                      Bạn phải là trưởng nhóm của ít nhất một nhóm để mua gói này.
                    </Text>
                  </View>
                ) : (
                  workspaces.map((workspace: any) => {
                    const workspaceId = getWorkspaceId(workspace);
                    const isSelected = Number(selectedWorkspaceId) === workspaceId;

                    return (
                      <TouchableOpacity
                        key={workspaceId}
                        activeOpacity={0.85}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedWorkspaceId(null);
                            setSelectedWorkspaceName('');
                            return;
                          }

                          setSelectedWorkspaceId(workspaceId);
                          setSelectedWorkspaceName(getWorkspaceName(workspace));
                        }}
                        style={[
                          styles.groupItem,
                          {
                            backgroundColor: isSelected
                              ? isDark
                                ? 'rgba(37,99,235,0.15)'
                                : '#EFF6FF'
                              : isDark
                              ? '#0F172A'
                              : '#F8FAFC',
                            borderColor: isSelected
                              ? Colors.primary
                              : colors.border,
                          },
                        ]}>
                        <Icon
                          name="account-group-outline"
                          size={18}
                          color={isDark ? '#FBBF24' : '#D97706'}
                        />
                        <Text
                          style={[styles.groupName, {color: colors.heading}]}
                          numberOfLines={1}>
                          {getWorkspaceName(workspace)}
                        </Text>
                        <Text
                          style={[
                            styles.groupMemberCount,
                            {color: colors.textTertiary},
                          ]}>
                          {workspace.memberCount || 0} thành viên
                        </Text>
                        <Icon
                          name={isSelected ? 'chevron-right' : 'circle-outline'}
                          size={18}
                          color={isSelected ? Colors.primary : colors.textTertiary}
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            ) : null}

            <View
              style={[
                styles.methodsCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}>
              <View
                style={[
                  styles.methodsHeader,
                  {borderBottomColor: isDark ? '#1E293B' : '#F1F5F9'},
                ]}>
                <Text
                  style={[
                    styles.methodsTitle,
                    {color: isDark ? '#64748B' : '#0284C7'},
                  ]}>
                  Phương thức thanh toán
                </Text>
                <Text
                  style={[
                    styles.methodsHint,
                    {color: isDark ? '#94A3B8' : '#64748B'},
                  ]}>
                  Chọn một phương thức bên dưới để tiếp tục checkout an toàn.
                </Text>
              </View>

              <View style={styles.methodsList}>
                {PAYMENT_METHODS.map(method => {
                  const isSelected = selectedMethod === method.id;

                  return (
                    <TouchableOpacity
                      key={method.id}
                      activeOpacity={0.85}
                      disabled={processing}
                      onPress={() => setSelectedMethod(method.id)}
                      style={[
                        styles.methodCard,
                        {
                          backgroundColor: isSelected
                            ? isDark
                              ? '#0F172A'
                              : '#F0F9FF'
                            : isDark
                            ? 'rgba(2,6,23,0.45)'
                            : '#FFFFFF',
                          borderColor: isSelected
                            ? isDark
                              ? 'rgba(56,189,248,0.30)'
                              : '#BAE6FD'
                            : isDark
                            ? '#1E293B'
                            : '#E2E8F0',
                          opacity: processing ? 0.7 : 1,
                        },
                      ]}>
                      <View
                        style={[
                          styles.radioOuter,
                          {
                            borderColor: isSelected
                              ? isDark
                                ? '#38BDF8'
                                : '#0EA5E9'
                              : isDark
                              ? '#475569'
                              : '#CBD5E1',
                          },
                        ]}>
                        <View
                          style={[
                            styles.radioInner,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? '#38BDF8'
                                  : '#0EA5E9'
                                : 'transparent',
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.methodInfo}>
                        <Text
                          style={[
                            styles.methodName,
                            {color: isDark ? '#F1F5F9' : '#0F172A'},
                          ]}>
                          {method.label}
                        </Text>
                        <Text
                          style={[
                            styles.methodSub,
                            {color: isDark ? '#94A3B8' : '#64748B'},
                          ]}>
                          {method.description}
                        </Text>
                      </View>

                      <View style={styles.methodLogoSlot}>
                        {method.id === 'stripe' ? (
                          <Text style={styles.stripeLogoText}>stripe</Text>
                        ) : (
                          <Image
                            source={method.logo}
                            style={
                              method.id === 'momo'
                                ? styles.momoLogo
                                : styles.vnpayLogo
                            }
                            resizeMode="contain"
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View
              style={[
                styles.summaryCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: isDark ? '#334155' : '#E2E8F0',
                },
              ]}>
              <View style={styles.summaryTopWash} />
              <View style={styles.summaryBody}>
                <Text style={[styles.summaryTitle, {color: colors.heading}]}>
                  Tóm tắt đơn hàng
                </Text>
                <View style={styles.summaryAccent} />

                <View
                  style={[
                    styles.summaryLine,
                    {backgroundColor: isDark ? '#1E293B' : '#F8FAFC'},
                  ]}>
                  <Text
                    style={[
                      styles.summaryLineLabel,
                      {color: colors.textSecondary},
                    ]}
                    numberOfLines={2}>
                    {displayPlanName}
                  </Text>
                  <Text
                    style={[styles.summaryLineValue, {color: colors.heading}]}>
                    {formatCurrency(planPrice)}
                  </Text>
                </View>

                <View
                  style={[
                    styles.summaryLine,
                    {
                      backgroundColor: isDark
                        ? 'rgba(15,23,42,0.78)'
                        : '#F8FAFC',
                    },
                  ]}>
                  <Text
                    style={[
                      styles.summaryLineLabel,
                      {color: colors.textSecondary},
                    ]}>
                    Thời hạn
                  </Text>
                  <Text
                    style={[styles.summaryLineValue, {color: colors.heading}]}>
                    {displayDuration}
                  </Text>
                </View>

                {isGroupPlan && paymentWorkspaceId > 0 ? (
                  <View
                    style={[
                      styles.summaryLine,
                      {
                        backgroundColor: isDark
                          ? 'rgba(59,130,246,0.12)'
                          : '#EFF6FF',
                      },
                    ]}>
                    <Text
                      style={[
                        styles.summaryLineLabel,
                        {color: isDark ? '#BFDBFE' : '#1D4ED8'},
                      ]}>
                      Áp dụng cho
                    </Text>
                    <Text
                      style={[
                        styles.summaryLineValue,
                        {color: isDark ? '#DBEAFE' : '#1E3A8A'},
                      ]}
                      numberOfLines={1}>
                      {appliedWorkspaceName}
                    </Text>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.summaryDivider,
                    {borderTopColor: isDark ? '#334155' : '#E2E8F0'},
                  ]}
                />

                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, {color: colors.heading}]}>
                    Tổng cộng
                  </Text>
                  <Text style={[styles.totalValue, {color: colors.heading}]}>
                    {formatCurrency(planPrice)}
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={payDisabled}
                  onPress={handlePayment}
                  style={[
                    styles.payAction,
                    payDisabled
                      ? {
                          backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
                        }
                      : {
                          backgroundColor: isDark ? '#7DD3FC' : Colors.primary,
                        },
                  ]}>
                  {processing ? (
                    <>
                      <ActivityIndicator
                        size="small"
                        color={isDark ? '#020617' : '#FFFFFF'}
                      />
                      <Text
                        style={[
                          styles.payActionText,
                          {color: isDark ? '#020617' : '#FFFFFF'},
                        ]}>
                        Đang xử lý
                      </Text>
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.payActionText,
                        {
                          color: payDisabled
                            ? isDark
                              ? '#64748B'
                              : '#94A3B8'
                            : isDark
                            ? '#020617'
                            : '#FFFFFF',
                        },
                      ]}>
                      Thanh toán ngay
                    </Text>
                  )}
                </TouchableOpacity>

                {needGroupSelect ? (
                  <View
                    style={[
                      styles.selectWarning,
                      {
                        backgroundColor: isDark
                          ? 'rgba(245,158,11,0.12)'
                          : '#FFFBEB',
                        borderColor: isDark
                          ? 'rgba(245,158,11,0.35)'
                          : '#FDE68A',
                      },
                    ]}>
                    <Icon
                      name="alert-outline"
                      size={18}
                      color={isDark ? '#FBBF24' : '#D97706'}
                    />
                    <Text
                      style={[
                        styles.selectWarningText,
                        {color: isDark ? '#FCD34D' : '#B45309'},
                      ]}>
                      Vui lòng chọn nhóm trước khi thanh toán.
                    </Text>
                  </View>
                ) : !selectedMethod ? (
                  <Text
                    style={[
                      styles.summaryHint,
                      {color: isDark ? '#94A3B8' : '#64748B'},
                    ]}>
                    Chọn phương thức thanh toán để bật nút tiếp tục.
                  </Text>
                ) : null}

                <View style={styles.secureRow}>
                  <Icon
                    name="shield-check-outline"
                    size={17}
                    color={isDark ? '#BAE6FD' : '#0369A1'}
                  />
                  <Text
                    style={[
                      styles.secureText,
                      {color: isDark ? '#BAE6FD' : '#0369A1'},
                    ]}>
                    Bảo mật thanh toán và mã hóa SSL
                  </Text>
                </View>
              </View>
            </View>
          </>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 48,
    gap: Spacing.lg,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing['2xl'],
    alignItems: 'center',
  },
  errorTitle: {
    marginTop: Spacing.md,
    fontSize: 18,
    fontWeight: '800',
  },
  errorText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  planInfoCard: {
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  planAccentBar: {
    height: 6,
    backgroundColor: Colors.primary,
  },
  planInfoBody: {
    padding: Spacing.lg,
  },
  planInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  panelTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  planPreviewCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
  },
  planPreviewTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  planNameRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  planName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  scopeBadge: {
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  scopeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  planPrice: {
    marginTop: Spacing.md,
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 40,
  },
  durationRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  durationText: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailGrid: {
    gap: Spacing.md,
  },
  detailPanel: {
    borderRadius: 18,
    padding: Spacing.base,
  },
  detailPanelTitle: {
    marginBottom: Spacing.md,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 34,
  },
  detailIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '800',
  },
  detailEmptyText: {
    fontSize: 13,
    lineHeight: 19,
  },
  bonusCard: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.base,
  },
  bonusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  groupCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.lg,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  groupDescription: {
    marginTop: 6,
    marginBottom: Spacing.base,
    fontSize: 13,
    lineHeight: 19,
  },
  noGroupsCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: Spacing.base,
    borderRadius: 16,
    borderWidth: 1,
  },
  noGroupsText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: Spacing.base,
    marginTop: Spacing.sm,
  },
  groupItemSelected: {
    borderColor: Colors.primary,
  },
  groupName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  groupMemberCount: {
    fontSize: 12,
  },
  methodsCard: {
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  methodsHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  methodsTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  methodsHint: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  methodsList: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: 20,
    padding: Spacing.base,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 14,
    fontWeight: '800',
  },
  methodSub: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  methodLogoSlot: {
    width: 92,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momoLogo: {
    width: 78,
    height: 36,
  },
  vnpayLogo: {
    width: 92,
    height: 34,
  },
  stripeLogoText: {
    color: '#635BFF',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  summaryCard: {
    position: 'relative',
    borderWidth: 1,
    borderRadius: 24,
    overflow: 'hidden',
  },
  summaryTopWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 92,
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  summaryBody: {
    padding: Spacing.lg,
  },
  summaryTitle: {
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 32,
  },
  summaryAccent: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xl,
    width: 96,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
    borderRadius: 18,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    marginBottom: Spacing.md,
  },
  summaryLineLabel: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
  summaryLineValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  summaryDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  totalValue: {
    flexShrink: 1,
    textAlign: 'right',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },
  payAction: {
    minHeight: 56,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  payActionText: {
    fontSize: 17,
    fontWeight: '800',
  },
  selectWarning: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.base,
  },
  selectWarningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  summaryHint: {
    marginTop: Spacing.md,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 17,
  },
  secureRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    marginTop: Spacing.lg,
  },
  secureText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
