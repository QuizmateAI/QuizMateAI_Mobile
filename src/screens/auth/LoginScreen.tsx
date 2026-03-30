import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GoogleSignin, statusCodes} from '@react-native-google-signin/google-signin';
import {getApps, initializeApp} from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import {GOOGLE_WEB_CLIENT_ID} from '@env';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import Button from '../../components/ui/Button';
import FloatingInput from '../../components/ui/Input';
import AuthAPI from '../../api/AuthAPI';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const FIREBASE_OPTIONS = {
  apiKey: 'AIzaSyA3iierNs4x4exhpq2HVJ-mcKr2MEL-Eb4',
  appId: '1:204251479274:android:b157f4ed48540454906b93',
  databaseURL: 'https://quizmateai-5934a-default-rtdb.firebaseio.com',
  projectId: 'quizmateai-5934a',
  messagingSenderId: '204251479274',
  storageBucket: 'quizmateai-5934a.firebasestorage.app',
};

export default function LoginScreen({navigation}: any) {
  const {isDark, colors, toggleTheme} = useTheme();
  const {login} = useAuth();
  const {showToast} = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true,
    });
  }, []);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showToast('Vui lòng điền đầy đủ thông tin', 'warning');
      return;
    }
    setLoading(true);
    try {
      const response = await AuthAPI.login(username, password);
      const payload = response?.data?.data ?? response?.data;
      const token = payload?.accessToken ?? payload?.token;
      const profile = payload?.user ?? {};

      if (!token) {
        throw new Error('Phản hồi đăng nhập không chứa access token');
      }

      const authUser = {
        id: Number(payload?.userID ?? payload?.id ?? profile?.id ?? 0),
        username: profile?.username ?? payload?.username ?? username.trim(),
        email: profile?.email ?? payload?.email ?? '',
        fullName:
          profile?.fullName ??
          profile?.fullname ??
          payload?.username ??
          username.trim(),
        avatarUrl: profile?.avatarUrl ?? profile?.avatar,
        role: payload?.role ?? profile?.role ?? 'USER',
      };

      if (!authUser.email) {
        throw new Error('Phản hồi đăng nhập không chứa thông tin người dùng');
      }

      await login(token, authUser);
      showToast('Đăng nhập thành công!', 'success');
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Đăng nhập thất bại';
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      if (getApps().length === 0) {
        await initializeApp(FIREBASE_OPTIONS);
      }

      await GoogleSignin.hasPlayServices({showPlayServicesUpdateDialog: true});

      // Ensure account chooser is shown for each login attempt.
      if (await GoogleSignin.hasPreviousSignIn()) {
        await GoogleSignin.signOut();
      }

      const signInResponse = await GoogleSignin.signIn();
      const idToken = signInResponse.data?.idToken;

      if (!idToken) {
        throw new Error('Không nhận được ID token từ Google');
      }

      const googleCredential = auth.GoogleAuthProvider.credential(idToken);
      const userCredential = await auth().signInWithCredential(googleCredential);
      const firebaseIdToken = await userCredential.user.getIdToken();

      const response = await AuthAPI.firebaseLogin(firebaseIdToken);
      const payload = response?.data?.data ?? response?.data;
      const token = payload?.accessToken ?? payload?.token;
      const profile = payload?.user ?? {};

      if (!token) {
        throw new Error('Phản hồi đăng nhập Google không chứa access token');
      }

      const authUser = {
        id: Number(payload?.userID ?? payload?.id ?? profile?.id ?? 0),
        username: profile?.username ?? payload?.username ?? 'google-user',
        email: profile?.email ?? payload?.email ?? '',
        fullName:
          profile?.fullName ??
          profile?.fullname ??
          payload?.username ??
          'Google User',
        avatarUrl: profile?.avatarUrl ?? profile?.avatar,
        role: payload?.role ?? profile?.role ?? 'USER',
      };

      if (!authUser.email) {
        throw new Error('Phản hồi đăng nhập Google không chứa thông tin người dùng');
      }

      await login(token, authUser);
      showToast('Đăng nhập thành công!', 'success');
    } catch (error: any) {
      if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      }

      if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        showToast('Google Play Services không khả dụng', 'error');
        return;
      }

      const msg = error?.response?.data?.message || error?.message || 'Đăng nhập Google thất bại';
      showToast(msg, 'error');
    } finally {
      setGoogleLoading(false);
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
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={toggleTheme} style={styles.themeBtn}>
              <Text style={{color: colors.icon, fontSize: 20}}>
                {isDark ? '☀️' : '🌙'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Logo */}
          <View style={styles.logoContainer}>
            <View
              style={[
                styles.logoPlaceholder,
                {backgroundColor: Colors.primary},
              ]}>
              <Text style={styles.logoText}>Q</Text>
            </View>
            <Text style={[styles.appName, {color: colors.heading}]}>
              QuizMate AI
            </Text>
          </View>

          {/* Title */}
          <Text style={[styles.title, {color: colors.heading}]}>
            Chào mừng bạn quay lại
          </Text>
          <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
            Đăng nhập để tiếp tục học
          </Text>

          {/* Form */}
          <View style={styles.form}>
            <FloatingInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <FloatingInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              onToggleSecure={() => setShowPassword(!showPassword)}
              showSecureToggle
            />

            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotBtn}>
              <Text style={[styles.forgotText, {color: Colors.accent}]}>
                Quên mật khẩu?
              </Text>
            </TouchableOpacity>

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              style={styles.signInBtn}
            />

            <View style={styles.dividerRow}>
              <View
                style={[styles.dividerLine, {backgroundColor: colors.border}]}
              />
              <Text style={[styles.dividerText, {color: colors.textTertiary}]}>
                hoặc
              </Text>
              <View
                style={[styles.dividerLine, {backgroundColor: colors.border}]}
              />
            </View>

            <TouchableOpacity
              onPress={handleGoogleLogin}
              disabled={googleLoading}
              activeOpacity={0.8}
              style={[
                styles.googleButton,
                {borderColor: colors.border},
                googleLoading && styles.googleButtonDisabled,
              ]}>
              {googleLoading ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Icon
                    name="google"
                    size={18}
                    color={colors.text}
                    style={styles.googleIcon}
                  />
                  <Text style={[styles.googleText, {color: colors.text}]}>Tiếp tục với Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Sign Up Link */}
          <View style={styles.signUpRow}>
            <Text style={[styles.signUpText, {color: colors.textSecondary}]}>
              Chưa có tài khoản?{' '}
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={[styles.signUpLink, {color: Colors.accent}]}>
                Đăng ký
              </Text>
            </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing.sm,
  },
  themeBtn: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: Spacing['2xl'],
    marginBottom: Spacing.xl,
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing['2xl'],
  },
  form: {
    gap: Spacing.base,
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: -Spacing.sm,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '500',
  },
  signInBtn: {
    marginTop: Spacing.sm,
  },
  googleButton: {
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleIcon: {
    marginRight: 8,
  },
  googleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    marginHorizontal: Spacing.base,
    fontSize: 13,
  },
  signUpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing['2xl'],
  },
  signUpText: {
    fontSize: 14,
  },
  signUpLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
