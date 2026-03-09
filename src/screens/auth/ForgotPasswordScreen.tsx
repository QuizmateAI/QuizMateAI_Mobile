import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import FloatingInput from '../../components/ui/Input';
import AuthAPI from '../../api/AuthAPI';
type Step = 'email' | 'otp' | 'reset';

export default function ForgotPasswordScreen({navigation}: any) {
  const {colors} = useTheme();
  const {showToast} = useToast();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email.trim()) {
      showToast('Please enter your email', 'warning');
      return;
    }
    setLoading(true);
    try {
      await AuthAPI.sendOtp(email);
      setStep('otp');
      showToast('OTP sent to your email', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Failed to send OTP', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      showToast('Please enter OTP', 'warning');
      return;
    }
    setLoading(true);
    try {
      await AuthAPI.verifyOtp(email, otp);
      setStep('reset');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Invalid OTP', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      await AuthAPI.resetPassword(email, otp, newPassword);
      showToast('Password reset successfully!', 'success');
      navigation.navigate('Login');
    } catch (error: any) {
      showToast(
        error?.response?.data?.message || 'Reset failed',
        'error',
      );
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<Step, {title: string; subtitle: string}> = {
    email: {
      title: 'Forgot Password',
      subtitle: 'Enter your email to receive a reset code',
    },
    otp: {title: 'Verify Code', subtitle: `Enter the code sent to ${email}`},
    reset: {title: 'New Password', subtitle: 'Create a strong password'},
  };

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}>
            <Icon name="chevron-left" size={28} color={colors.text} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <View
              style={[
                styles.iconCircle,
                {backgroundColor: Colors.primaryLight},
              ]}>
              <Icon name="lock-reset" size={32} color={Colors.primary} />
            </View>
          </View>

          <Text style={[styles.title, {color: colors.heading}]}>
            {titles[step].title}
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            {titles[step].subtitle}
          </Text>

          <View style={styles.form}>
            {step === 'email' && (
              <>
                <FloatingInput
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Button
                  title="Send Code"
                  onPress={handleSendOtp}
                  loading={loading}
                />
              </>
            )}
            {step === 'otp' && (
              <>
                <FloatingInput
                  label="Enter OTP"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                />
                <Button
                  title="Verify Code"
                  onPress={handleVerifyOtp}
                  loading={loading}
                />
              </>
            )}
            {step === 'reset' && (
              <>
                <FloatingInput
                  label="New Password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                />
                <FloatingInput
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
                <Button
                  title="Reset Password"
                  onPress={handleResetPassword}
                  loading={loading}
                />
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  flex: {flex: 1},
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['2xl'],
  },
  backBtn: {
    marginTop: Spacing.sm,
    width: 40,
  },
  iconContainer: {
    alignItems: 'center',
    marginTop: Spacing['3xl'],
    marginBottom: Spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
  },
  form: {gap: Spacing.base},
});
