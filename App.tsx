import React from 'react';
import './src/utils/i18n';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PaperProvider} from 'react-native-paper';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {StyleSheet} from 'react-native';
import auth from '@react-native-firebase/auth';
import {ThemeProvider, useTheme} from './src/context/ThemeContext';
import {AuthProvider, useAuth} from './src/context/AuthContext';
import {ToastProvider} from './src/context/ToastContext';
import {LightTheme, DarkTheme} from './src/theme/theme';
import AuthStack from './src/navigation/AuthStack';
import MainTabNavigator from './src/navigation/MainTabNavigator';
import LoadingSpinner from './src/components/ui/LoadingSpinner';

// Initialize Firebase
if (!auth().app) {
  // Firebase app not initialized yet
  // Note: Firebase is auto-initialized with google-services.json / GoogleService-Info.plist
}

function AppNavigator() {
  const {isAuthenticated, isLoading} = useAuth();
  const {isDark} = useTheme();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <PaperProvider theme={isDark ? DarkTheme : LightTheme}>
      <NavigationContainer>
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
