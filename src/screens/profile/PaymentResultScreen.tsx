import React, {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import ManagementSystemAPI from '../../api/ManagementSystemAPI';

type ResultStatus = 'success' | 'failed' | 'processing';

const POLL_DELAY_MS = 1500;
const POLL_MAX_ATTEMPTS = 6;

const normalizePaymentRecord = (response: any) =>
  response?.data?.data ?? response?.data ?? response ?? null;

const normalizeStatus = (value: any): ResultStatus => {
  const status = String(value || '').toUpperCase();
  if (status === 'COMPLETED' || status === 'SUCCESS' || status === 'PAID') {
    return 'success';
  }
  if (
    status === 'FAILED' ||
    status === 'FAIL' ||
    status === 'CANCELLED' ||
    status === 'CANCELED' ||
    status === 'CANCEL'
  ) {
    return 'failed';
  }
  if (status === 'PENDING' || status === 'PROCESSING') {
    return 'processing';
  }
  return String(value || '').toLowerCase() === 'success'
    ? 'success'
    : String(value || '').toLowerCase() === 'processing'
    ? 'processing'
    : 'failed';
};

const formatCurrency = (value: any) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return '';
  }
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
};

const formatDateTime = (value: any) => {
  if (!value) {
    return '';
  }

  const raw = String(value);
  if (/^\d{14}$/.test(raw)) {
    const date = new Date(
      Number(raw.slice(0, 4)),
      Number(raw.slice(4, 6)) - 1,
      Number(raw.slice(6, 8)),
      Number(raw.slice(8, 10)),
      Number(raw.slice(10, 12)),
      Number(raw.slice(12, 14)),
    );
    return date.toLocaleString('vi-VN');
  }

  const numeric = Number(raw);
  const date =
    Number.isFinite(numeric) && raw.length >= 12
      ? new Date(numeric)
      : new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString('vi-VN');
};

const formatMethod = (value: any, fallbackProvider?: string) => {
  const raw = String(value || fallbackProvider || '').trim();
  const normalized = raw.toUpperCase();
  if (!raw) {
    return '';
  }
  if (normalized === 'MOMO') {
    return 'MoMo';
  }
  if (normalized === 'VNPAY' || raw.toLowerCase() === 'qr') {
    return 'VNPay QR';
  }
  if (normalized === 'STRIPE') {
    return 'Stripe';
  }
  return raw;
};

const getTone = (status: ResultStatus, isDark: boolean) => {
  if (status === 'success') {
    return {
      accent: '#10B981',
      soft: isDark ? 'rgba(16,185,129,0.14)' : '#ECFDF5',
      border: isDark ? 'rgba(52,211,153,0.28)' : '#A7F3D0',
      title: isDark ? '#D1FAE5' : '#064E3B',
      icon: 'check-circle',
    };
  }
  if (status === 'processing') {
    return {
      accent: Colors.primary,
      soft: isDark ? 'rgba(37,99,235,0.16)' : '#EFF6FF',
      border: isDark ? 'rgba(96,165,250,0.30)' : '#BFDBFE',
      title: isDark ? '#DBEAFE' : '#1E3A8A',
      icon: 'progress-clock',
    };
  }
  return {
    accent: '#EF4444',
    soft: isDark ? 'rgba(239,68,68,0.14)' : '#FEF2F2',
    border: isDark ? 'rgba(248,113,113,0.30)' : '#FECACA',
    title: isDark ? '#FEE2E2' : '#7F1D1D',
    icon: 'close-circle',
  };
};

export default function PaymentResultScreen({navigation, route}: any) {
  const {isDark, colors} = useTheme();
  const {
    status = 'processing',
    orderId = '',
    amount = 0,
    orderInfo = '',
    transId = '',
    payType = '',
    responseTime = '',
    purchaseType = 'plan',
    message = '',
    provider = '',
  } = route.params || {};
  const [paymentRecord, setPaymentRecord] = useState<any>(null);
  const [resolving, setResolving] = useState(Boolean(orderId));
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!orderId) {
      setResolving(false);
      return undefined;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) {
        return;
      }
      setResolving(true);

      try {
        const response = await ManagementSystemAPI.getPaymentByOrderId(orderId);
        if (cancelled) {
          return;
        }

        const record = normalizePaymentRecord(response);
        setPaymentRecord(record);
        const nextStatus = String(record?.paymentStatus || '').toUpperCase();
        if (nextStatus === 'PENDING' && attempts < POLL_MAX_ATTEMPTS) {
          attempts += 1;
          timeoutId = setTimeout(poll, POLL_DELAY_MS);
          return;
        }
      } catch {
        if (!cancelled && attempts < 2) {
          attempts += 1;
          timeoutId = setTimeout(poll, POLL_DELAY_MS);
          return;
        }
      }

      if (!cancelled) {
        setResolving(false);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [orderId, refreshNonce]);

  const resultStatus = useMemo<ResultStatus>(() => {
    const backendStatus = paymentRecord?.paymentStatus;
    if (backendStatus) {
      return normalizeStatus(backendStatus);
    }
    if (resolving && orderId) {
      return 'processing';
    }
    return normalizeStatus(status);
  }, [orderId, paymentRecord?.paymentStatus, resolving, status]);

  const isCreditPurchase = purchaseType === 'credit';
  const tone = getTone(resultStatus, isDark);
  const recordAmount = paymentRecord?.amount ?? paymentRecord?.gatewayAmount;
  const amountLabel = formatCurrency(recordAmount || amount);
  const methodLabel = formatMethod(
    paymentRecord?.paymentMethod ||
      paymentRecord?.gateway ||
      paymentRecord?.paymentGateway ||
      payType,
    provider,
  );
  const resultTime = formatDateTime(
    paymentRecord?.paidAt ||
      paymentRecord?.gatewayVerifiedAt ||
      paymentRecord?.createdAt ||
      responseTime,
  );
  const resultOrderId = paymentRecord?.orderId || orderId;
  const transactionId =
    paymentRecord?.gatewayTransactionId || transId || paymentRecord?.paymentId;
  const description = orderInfo || message;

  const copy = useMemo(() => {
    if (resultStatus === 'success') {
      return {
        eyebrow: 'Thanh toán thành công',
        title: isCreditPurchase
          ? 'Credit đã sẵn sàng'
          : 'Mở khóa thành công',
        subtitle: isCreditPurchase
          ? 'Credit đã được cộng vào ví sau khi hệ thống xác nhận giao dịch.'
          : 'Gói đăng ký đã được kích hoạt. Bạn có thể bắt đầu học ngay.',
        primary: 'Bắt đầu học ngay',
      };
    }
    if (resultStatus === 'processing') {
      return {
        eyebrow: 'Đang xử lý',
        title: 'Đang xác minh thanh toán...',
        subtitle:
          'Giao dịch đã rời khỏi cổng thanh toán. Hệ thống đang đối soát trạng thái với nhà cung cấp.',
        primary: 'Làm mới trạng thái',
      };
    }
    return {
      eyebrow: 'Giao dịch thất bại',
      title: 'Chưa ghi nhận thanh toán',
      subtitle:
        message ||
        'Giao dịch không hoàn tất. Bạn có thể thử lại hoặc chọn phương thức khác.',
      primary: 'Thử lại',
    };
  }, [isCreditPurchase, message, resultStatus]);

  const timeline = [
    {
      label: 'Đã tạo đơn hàng',
      detail: resultOrderId ? `Mã đơn ${resultOrderId}` : 'Đơn hàng đã được ghi nhận',
      done: true,
    },
    {
      label:
        resultStatus === 'failed'
          ? 'Thanh toán không thành công'
          : 'Cổng thanh toán xác nhận',
      detail:
        resultStatus === 'failed'
          ? 'Nhà cung cấp trả về trạng thái thất bại hoặc đã hủy.'
          : methodLabel || 'Đang đồng bộ phản hồi từ cổng thanh toán.',
      done: resultStatus === 'success',
      active: resultStatus === 'processing',
      failed: resultStatus === 'failed',
    },
    {
      label: isCreditPurchase ? 'Cộng credit vào ví' : 'Cập nhật quyền lợi',
      detail: isCreditPurchase
        ? 'Credit sẽ hiển thị trong ví của bạn.'
        : 'Gói và quyền lợi được cập nhật sau khi thanh toán hoàn tất.',
      done: resultStatus === 'success',
      active: false,
      failed: resultStatus === 'failed',
    },
  ];

  const detailRows = [
    {label: 'Mã đơn hàng', value: resultOrderId},
    {label: 'Mã giao dịch', value: transactionId},
    {label: 'Số tiền', value: amountLabel},
    {label: 'Phương thức', value: methodLabel},
    {label: 'Nội dung', value: description},
    {label: 'Thời gian', value: resultTime},
  ].filter(row => row.value);

  const handlePrimaryAction = () => {
    if (resultStatus === 'processing') {
      if (orderId) {
        setPaymentRecord(null);
        setRefreshNonce(value => value + 1);
      }
      return;
    }

    if (resultStatus === 'failed') {
      navigation.navigate(isCreditPurchase ? 'CreditPackages' : 'Subscription');
      return;
    }

    navigation.getParent()?.navigate('Home');
  };

  const handleSecondaryAction = () => {
    navigation.navigate(isCreditPurchase ? 'PersonalWallet' : 'Subscription');
  };

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      <View style={[styles.statusBar, {backgroundColor: tone.accent}]} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surface,
              borderColor: tone.border,
            },
          ]}>
          <View
            style={[
              styles.eyebrowPill,
              {backgroundColor: tone.soft, borderColor: tone.border},
            ]}>
            <Text style={[styles.eyebrowText, {color: tone.accent}]}>
              {copy.eyebrow}
            </Text>
          </View>

          <View
            style={[
              styles.statusIconWrap,
              {backgroundColor: tone.soft, borderColor: tone.border},
            ]}>
            <Icon name={tone.icon} size={54} color={tone.accent} />
          </View>

          <Text style={[styles.title, {color: colors.heading}]}>
            {copy.title}
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            {copy.subtitle}
          </Text>

          {amountLabel ? (
            <View style={[styles.amountBox, {backgroundColor: tone.soft}]}>
              <Text style={[styles.amountLabel, {color: colors.textSecondary}]}>
                Tổng thanh toán
              </Text>
              <Text style={[styles.amountValue, {color: tone.title}]}>
                {amountLabel}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.panel,
            {backgroundColor: colors.surface, borderColor: colors.border},
          ]}>
          <View style={styles.panelHeader}>
            <Icon name="timeline-check-outline" size={18} color={tone.accent} />
            <Text style={[styles.panelTitle, {color: colors.heading}]}>
              Tiến trình giao dịch
            </Text>
          </View>
          <View style={styles.timeline}>
            {timeline.map((item, index) => {
              const itemColor = item.failed
                ? '#EF4444'
                : item.done
                ? '#10B981'
                : item.active
                ? Colors.primary
                : colors.textTertiary;

              return (
                <View key={`${item.label}-${index}`} style={styles.timelineRow}>
                  <View style={styles.timelineMarkerCol}>
                    <View
                      style={[
                        styles.timelineDot,
                        {
                          borderColor: itemColor,
                          backgroundColor:
                            item.done || item.failed || item.active
                              ? itemColor
                              : 'transparent',
                        },
                      ]}>
                      {item.done ? (
                        <Icon name="check" size={12} color="#FFFFFF" />
                      ) : item.failed ? (
                        <Icon name="close" size={12} color="#FFFFFF" />
                      ) : null}
                    </View>
                    {index < timeline.length - 1 ? (
                      <View
                        style={[
                          styles.timelineLine,
                          {backgroundColor: colors.border},
                        ]}
                      />
                    ) : null}
                  </View>
                  <View style={styles.timelineCopy}>
                    <Text style={[styles.timelineTitle, {color: colors.heading}]}>
                      {item.label}
                    </Text>
                    <Text
                      style={[
                        styles.timelineDetail,
                        {color: colors.textSecondary},
                      ]}>
                      {item.detail}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {detailRows.length > 0 ? (
          <View
            style={[
              styles.panel,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <View style={styles.panelHeader}>
              <Icon name="receipt-text-outline" size={18} color={colors.textTertiary} />
              <Text style={[styles.panelTitle, {color: colors.heading}]}>
                Chi tiết giao dịch
              </Text>
            </View>
            {detailRows.map((row, index) => (
              <View
                key={row.label}
                style={[
                  styles.detailRow,
                  index < detailRows.length - 1 && {
                    borderBottomColor: colors.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <Text style={[styles.detailKey, {color: colors.textSecondary}]}>
                  {row.label}
                </Text>
                <Text style={[styles.detailValue, {color: colors.heading}]}>
                  {String(row.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            title={copy.primary}
            onPress={handlePrimaryAction}
            icon={resultStatus === 'processing' ? 'refresh' : resultStatus === 'failed' ? 'replay' : 'home'}
          />
          <Button
            title={isCreditPurchase ? 'Về ví credit' : 'Về trang gói'}
            variant="outline"
            onPress={handleSecondaryAction}
            icon={isCreditPurchase ? 'wallet-outline' : 'credit-card-outline'}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  statusBar: {height: 5},
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 44,
    gap: Spacing.lg,
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 28,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  eyebrowPill: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: Spacing.lg,
  },
  eyebrowText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  statusIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  amountBox: {
    marginTop: Spacing.xl,
    width: '100%',
    borderRadius: 20,
    padding: Spacing.base,
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  amountValue: {
    marginTop: 4,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  panel: {
    borderWidth: 1,
    borderRadius: 24,
    padding: Spacing.lg,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.md,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  timeline: {
    gap: Spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  timelineMarkerCol: {
    alignItems: 'center',
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 1,
    minHeight: 34,
    marginVertical: 3,
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: Spacing.md,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  timelineDetail: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  detailKey: {
    flexShrink: 0,
    fontSize: 13,
  },
  detailValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
  },
  actions: {
    gap: Spacing.md,
  },
});
