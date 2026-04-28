import React, {createContext, useContext, useState, useCallback, useRef, useEffect} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Colors} from '../theme/colors';
import {useTheme} from './ThemeContext';
import {localizeUiText} from '../utils/uiText';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastData {
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({showToast: () => {}});

export function ToastProvider({children}: {children: React.ReactNode}) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const insets = useSafeAreaInsets();
  const {isDark} = useTheme();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info') => {
      if (!isMountedRef.current) return;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setToast({message: localizeUiText(message), type});

      timeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setToast(null);
      }, 3000);
    },
    [],
  );

  const getToastColor = (type: ToastType) => {
    switch (type) {
      case 'success':
        return Colors.success;
      case 'error':
        return Colors.error;
      case 'warning':
        return Colors.warning;
      default:
        return Colors.primary;
    }
  };

  return (
    <ToastContext.Provider value={{showToast}}>
      {children}
      {toast && (
        <View
          style={[
            styles.toast,
            {
              top: insets.top + 10,
              backgroundColor: isDark ? Colors.dark.surface : '#FFFFFF',
              borderLeftColor: getToastColor(toast.type),
              shadowColor: isDark ? Colors.dark.shadow : Colors.light.shadow,
            },
          ]}>
          <View
            style={[
              styles.toastIndicator,
              {backgroundColor: getToastColor(toast.type)},
            ]}
          />
          <Text
            style={[
              styles.toastText,
              {color: isDark ? Colors.dark.text : Colors.light.text},
            ]}>
            {toast.message}
          </Text>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 10,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    borderLeftWidth: 4,
  },
  toastIndicator: {
    width: 4,
    height: '100%',
    borderRadius: 2,
    marginRight: 12,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});
