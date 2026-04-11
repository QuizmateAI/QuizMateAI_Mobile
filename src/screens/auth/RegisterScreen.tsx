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
import {Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import FloatingInput from '../../components/ui/Input';
import AuthAPI from '../../api/AuthAPI';
import AppLogo from '../../components/AppLogo';

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validateUsername = (username: string): {isValid: boolean; message?: string} => {
  if (!username.trim()) {
    return {isValid: false, message: 'Bắt buộc nhập tên đăng nhập'};
  }
  if (username.length < 3 || username.length > 50) {
    return {isValid: false, message: 'Tên đăng nhập phải từ 3 đến 50 ký tự'};
  }
  const usernameRegex = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9._@-]+$/;
  if (!usernameRegex.test(username)) {
    return {isValid: false, message: 'Tên đăng nhập phải có cả chữ và số, có thể gồm . _ @ -'};
  }
  return {isValid: true};
};

const validatePassword = (password: string): {isValid: boolean; message?: string} => {
  if (!password.trim()) {
    return {isValid: false, message: 'Bắt buộc nhập mật khẩu'};
  }
  if (password.length < 9) {
    return {isValid: false, message: 'Mật khẩu phải có ít nhất 9 ký tự'};
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  if (!hasLetter || !hasNumber) {
    return {isValid: false, message: 'Mật khẩu phải có cả chữ và số'};
  }
  return {isValid: true};
};

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
  console.log('=== REGISTER BUTTON CLICKED ===');

  if (!fullName.trim()) {
    showToast('Bắt buộc nhập họ và tên', 'warning');
    return;
  }

  const usernameValidation = validateUsername(username);
  if (!usernameValidation.isValid) {
    showToast(usernameValidation.message || 'Tên đăng nhập không hợp lệ', 'error');
    return;
  }

  if (!validateEmail(email)) {
    showToast('Vui lòng nhập địa chỉ email hợp lệ', 'error');
    return;
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.isValid) {
    showToast(passwordValidation.message || 'Mật khẩu không hợp lệ', 'error');
    return;
  }

  if (!confirmPassword.trim()) {
    showToast('Vui lòng xác nhận mật khẩu', 'warning');
    return;
  }

  if (password !== confirmPassword) {
    showToast('Mật khẩu xác nhận không khớp', 'error');
    return;
  }

  setLoading(true);

  try {
    console.log('CHECKING USERNAME AVAILABILITY:', username);
    const checkUsernameRes = await AuthAPI.checkUsername(username);
    console.log('CHECK USERNAME RESPONSE:', checkUsernameRes);

    if (!checkUsernameRes.data.data) {
      showToast('Tên đăng nhập đã được sử dụng', 'error');
      return;
    }

    console.log('CHECKING EMAIL AVAILABILITY:', email);
    const checkRes = await AuthAPI.checkEmail(email);
    console.log('CHECK EMAIL RESPONSE:', checkRes);

    if (!checkRes.data.data) {
      showToast('Email đã được sử dụng', 'error');
      return;
    }

    console.log('CALLING SEND OTP API:', email);

    const otpRes = await AuthAPI.sendOtp(email);

    console.log('OTP SENT SUCCESS:', otpRes);

    setStep('otp');
    showToast('Đã gửi OTP đến email của bạn', 'success');

  } catch (error: any) {
    console.log('SEND OTP ERROR:', error);
    console.log('ERROR RESPONSE:', error?.response);
    console.log('ERROR DATA:', error?.response?.data);

    showToast(
      error?.response?.data?.message || 'Không thể gửi OTP',
      'error'
    );
  } finally {
    console.log('SEND OTP PROCESS FINISHED');
    setLoading(false);
  }
};

  const handleResendOtp = async () => {
    setLoading(true);
    try {
      console.log('RESENDING OTP TO:', email);
      await AuthAPI.sendOtp(email);
      showToast('Đã gửi lại OTP đến email của bạn', 'success');
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'Không thể gửi lại OTP', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim()) {
      showToast('Vui lòng nhập OTP', 'warning');
      return;
    }
    setLoading(true);
    try {
      console.log('CALLING VERIFY OTP API:', email, otp);
      const verifyRes = await AuthAPI.verifyOtp(email, otp);
      console.log('VERIFY OTP RESPONSE:', verifyRes);

      if (verifyRes.data.message === 'Xác thực thành công') {
        console.log('OTP VERIFIED SUCCESS');

        console.log('CALLING REGISTER API', {
          fullName,
          username,
          email,
          password,
        });

        const registerRes = await AuthAPI.register({
          fullName,
          username,
          email,
          password,
          confirmPassword,
        });

        console.log('REGISTER SUCCESS:', registerRes);

        showToast('Tạo tài khoản thành công!', 'success');
        navigation.navigate('Login');
      } else {
        console.log('OTP VERIFICATION FAILED:', verifyRes.data.message);
        showToast(verifyRes.data.message || 'OTP không hợp lệ', 'error');
      }
    } catch (error: any) {
      console.log('VERIFY OTP OR REGISTER ERROR:', error);
      showToast(error?.response?.data?.message || 'Xác minh thất bại', 'error');
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
            <AppLogo size={56} />
          </View>

          <Text style={[styles.title, {color: colors.heading}]}>
            {step === 'info' ? 'Tạo tài khoản' : 'Xác minh email'}
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            {step === 'info'
              ? 'Bắt đầu hành trình học tập của bạn'
              : `Nhập mã đã gửi đến ${email}`}
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
                onPress={handleResendOtp}
                style={styles.resendBtn}
                disabled={loading}>
                <Text style={[styles.resendText, {color: Colors.primary}]}>
                  Gửi lại OTP
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStep('info')}
                style={styles.backBtn}>
                <Text style={[styles.backText, {color: Colors.primary}]}>
                  Quay lại đăng ký
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 'info' && (
            <View style={styles.signInRow}>
              <Text
                style={[styles.signInText, {color: colors.textSecondary}]}>
                Đã có tài khoản?{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={[styles.signInLink, {color: Colors.accent}]}>
                  Đăng nhập
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
  resendBtn: {alignSelf: 'center', marginTop: Spacing.sm},
  resendText: {fontSize: 14, fontWeight: '500'},
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing['2xl'],
  },
  signInText: {fontSize: 14},
  signInLink: {fontSize: 14, fontWeight: '600'},
});
