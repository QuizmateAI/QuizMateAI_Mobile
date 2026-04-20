import React, {useEffect} from 'react';
import './src/utils/i18n';
import {Linking} from 'react-native';
import {NavigationContainer, createNavigationContainerRef} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PaperProvider} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {StyleSheet} from 'react-native';
import {ThemeProvider, useTheme} from './src/context/ThemeContext';
import {AuthProvider, useAuth} from './src/context/AuthContext';
import {ToastProvider} from './src/context/ToastContext';
import {LightTheme, DarkTheme} from './src/theme/theme';
import AuthStack from './src/navigation/AuthStack';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import LoadingSpinner from './src/components/ui/LoadingSpinner';
import {isPaymentCallbackUrl, parsePaymentResultFromUrl} from './src/utils/paymentDeepLink';

const navigationRef = createNavigationContainerRef<any>();

function AppNavigator() {
  const {isAuthenticated, isLoading} = useAuth();
  const {isDark} = useTheme();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const handleIncomingUrl = (url?: string | null) => {
      if (!url || !isPaymentCallbackUrl(url) || !navigationRef.isReady()) {
        return;
      }

      const parsed = parsePaymentResultFromUrl(url);
      if (!parsed) {
        return;
      }

      navigationRef.navigate('Profile', {
        screen: 'PaymentResult',
        params: parsed,
      });
    };

    Linking.getInitialURL().then(initialUrl => {
      handleIncomingUrl(initialUrl);
    });

    const sub = Linking.addEventListener('url', event => {
      handleIncomingUrl(event?.url);
    });

    return () => {
      sub.remove();
    };
  }, [isAuthenticated]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <PaperProvider theme={isDark ? DarkTheme : LightTheme}>
      <NavigationContainer ref={navigationRef}>
        {isAuthenticated ? <MainTabNavigator /> : <AuthStack />}
      </NavigationContainer>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <AppNavigator />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
