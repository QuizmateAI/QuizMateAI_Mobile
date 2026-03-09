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
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import FloatingInput from '../../components/ui/Input';
import AuthAPI from '../../api/AuthAPI';

type Step = 'info' | 'otp';

export default function RegisterScreen({navigation}: any) {
  const {colors} = useTheme();
  const {showToast} = useToast();
  const [step, setStep] = useState<Step>('info');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleRegister = async () => {
    if (!fullName || !username || !email || !password) {
      showToast('Please fill in all fields', 'warning');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setLoading(true);
    try {
      await AuthAPI.register({fullName, username, email, password});
      await AuthAPI.sendOtp(email);
      setStep('otp');
      showToast('OTP sent to your email', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Registration failed', 'error');
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
      showToast('Account created successfully!', 'success');
      navigation.navigate('Login');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Invalid OTP', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {/* Logo */}
          <View style={styles.logoContainer}>
            <View
              style={[
                styles.logoPlaceholder,
                {backgroundColor: Colors.primary},
              ]}>
              <Text style={styles.logoText}>Q</Text>
            </View>
          </View>

          <Text style={[styles.title, {color: colors.heading}]}>
            {step === 'info' ? 'Create Account' : 'Verify Email'}
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            {step === 'info'
              ? 'Start your learning journey'
              : `Enter the code sent to ${email}`}
          </Text>

          {step === 'info' ? (
            <View style={styles.form}>
              <FloatingInput
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
              />
              <FloatingInput
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
              />
              <FloatingInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <FloatingInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onToggleSecure={() => setShowPassword(!showPassword)}
                showSecureToggle
              />
              <FloatingInput
                label="Confirm Password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <Button
                title="Sign Up"
                onPress={handleRegister}
                loading={loading}
                style={styles.btn}
              />
            </View>
          ) : (
            <View style={styles.form}>
              <FloatingInput
                label="Enter OTP"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
              />
              <Button
                title="Verify"
                onPress={handleVerifyOtp}
                loading={loading}
                style={styles.btn}
              />
              <TouchableOpacity
                onPress={() => setStep('info')}
                style={styles.backBtn}>
                <Text style={[styles.backText, {color: Colors.primary}]}>
                  Back to registration
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'info' && (
            <View style={styles.signInRow}>
              <Text
                style={[styles.signInText, {color: colors.textSecondary}]}>
                Already have an account?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={[styles.signInLink, {color: Colors.accent}]}>
                  Sign in
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
  logoContainer: {
    alignItems: 'center',
    marginTop: Spacing['3xl'],
    marginBottom: Spacing.lg,
  },
  logoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
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
    marginBottom: Spacing.xl,
  },
  form: {gap: Spacing.base},
  btn: {marginTop: Spacing.sm},
  backBtn: {alignSelf: 'center', marginTop: Spacing.base},
  backText: {fontSize: 14, fontWeight: '500'},
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing['2xl'],
  },
  signInText: {fontSize: 14},
  signInLink: {fontSize: 14, fontWeight: '600'},
});
