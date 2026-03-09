import React from 'react';
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
import Button from '../../components/ui/Button';

export default function PaymentResultScreen({navigation, route}: any) {
  const {isDark, colors} = useTheme();
  const {
    status = 'success',
    orderId = '',
    amount = 0,
    orderInfo = '',
    transId = '',
    payType = '',
    responseTime = '',
  } = route.params || {};

  const isSuccess = status === 'success';

  const formattedAmount = new Intl.NumberFormat('vi-VN').format(Number(amount));
  const formattedTime = responseTime
    ? new Date(Number(responseTime)).toLocaleString('vi-VN')
    : '';

  const infoRows = [
    {label: 'Order ID', value: orderId},
    {label: 'Transaction ID', value: transId},
    {label: 'Amount', value: amount ? `${formattedAmount}₫` : ''},
    {label: 'Description', value: orderInfo},
    {label: 'Payment Type', value: payType === 'qr' ? 'QR Code' : payType},
    {label: 'Time', value: formattedTime},
  ].filter(row => row.value);

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      {/* Status Bar */}
      <View
        style={[
          styles.statusBar,
          {
            backgroundColor: isSuccess ? '#10B981' : '#EF4444',
          },
        ]}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* Status Icon */}
        <View style={styles.statusSection}>
          <View
            style={[
              styles.statusIconWrap,
              {
                backgroundColor: isSuccess
                  ? isDark
                    ? 'rgba(16,185,129,0.15)'
                    : '#ECFDF5'
                  : isDark
                  ? 'rgba(239,68,68,0.15)'
                  : '#FEF2F2',
              },
            ]}>
            <Icon
              name={isSuccess ? 'check-circle' : 'close-circle'}
              size={48}
              color={isSuccess ? '#10B981' : '#EF4444'}
            />
          </View>
          <Text style={[styles.statusTitle, {color: colors.heading}]}>
            {isSuccess ? 'Payment Successful!' : 'Payment Failed'}
          </Text>
          <Text style={[styles.statusDesc, {color: colors.textSecondary}]}>
            {isSuccess
              ? 'Your subscription has been activated'
              : 'Something went wrong with your payment'}
          </Text>
        </View>

        {/* Transaction Details */}
        {infoRows.length > 0 && (
          <View
            style={[
              styles.detailsCard,
              {backgroundColor: colors.surface, borderColor: colors.border},
            ]}>
            <View style={styles.detailsHeader}>
              <Icon
                name="receipt"
                size={14}
                color={colors.textTertiary}
              />
              <Text style={[styles.detailsLabel, {color: colors.textTertiary}]}>
                TRANSACTION DETAILS
              </Text>
            </View>
            {infoRows.map((row, idx) => (
              <View
                key={row.label}
                style={[
                  styles.detailRow,
                  idx < infoRows.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}>
                <Text style={[styles.detailKey, {color: colors.textSecondary}]}>
                  {row.label}
                </Text>
                <Text
                  style={[styles.detailValue, {color: colors.heading}]}
                  numberOfLines={2}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Back to Plans"
            variant="outline"
            size="lg"
            icon="arrow-left"
            onPress={() => navigation.navigate('Subscription')}
            style={styles.actionBtn}
          />
          <Button
            title="Go Home"
            size="lg"
            icon="home"
            onPress={() => navigation.navigate('Home')}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  statusBar: {height: 4},
  scrollContent: {
    padding: Spacing.xl,
    paddingBottom: 40,
    flexGrow: 1,
    justifyContent: 'center',
  },
  statusSection: {alignItems: 'center', marginBottom: Spacing['2xl']},
  statusIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  statusTitle: {fontSize: 24, fontWeight: '700', textAlign: 'center'},
  statusDesc: {fontSize: 14, textAlign: 'center', marginTop: 6},

  detailsCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  detailsLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.lg,
  },
  detailKey: {fontSize: 13, flexShrink: 0},
  detailValue: {fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1},

  actions: {gap: Spacing.md},
  actionBtn: {},
});
