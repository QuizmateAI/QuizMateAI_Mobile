import React, {useCallback, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Button from '../../components/ui/Button';
import {useTheme} from '../../context/ThemeContext';
import {useToast} from '../../context/ToastContext';
import {Colors} from '../../theme/colors';
import {BorderRadius, Spacing} from '../../theme/spacing';
import {
  isPaymentCallbackUrl,
  parsePaymentResultFromUrl,
} from '../../utils/paymentDeepLink';

const PROVIDER_LABELS: Record<string, string> = {
  momo: 'MoMo',
  vnpay: 'VNPay',
  stripe: 'Stripe',
};

const isHttpUrl = (url: string) => /^https?:\/\//i.test(String(url || ''));
const isBlankWebViewUrl = (url: string) =>
  !url || String(url).toLowerCase() === 'about:blank';

const PAYMENT_WEBVIEW_INJECTED_JS = `
  (function () {
    window.open = function (url) {
      if (url) {
        window.location.href = url;
      }
      return null;
    };

    document.addEventListener('click', function (event) {
      var node = event.target;
      while (node && node.tagName !== 'A') {
        node = node.parentElement;
      }
      if (node && node.target === '_blank') {
        node.target = '_self';
      }
    }, true);
  })();
  true;
`;

let CachedWebView: React.ComponentType<any> | null | undefined;

const getWebViewComponent = () => {
  if (CachedWebView !== undefined) {
    return CachedWebView;
  }

  try {
    const webViewModule = require('react-native-webview');
    CachedWebView =
      webViewModule?.default || webViewModule?.WebView || webViewModule;
  } catch {
    CachedWebView = null;
  }

  return CachedWebView;
};

export default function PaymentWebViewScreen({navigation, route}: any) {
  const {isDark, colors} = useTheme();
  const {showToast} = useToast();
  const webViewRef = useRef<any>(null);
  const {
    paymentUrl = '',
    provider = '',
    purchaseType = 'plan',
    title = '',
  } = route.params || {};
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const providerLabel =
    PROVIDER_LABELS[String(provider).toLowerCase()] || 'Thanh toán';
  const screenTitle = title || providerLabel;
  const WebViewComponent = getWebViewComponent();

  const navigateToResult = useCallback(
    (url: string) => {
      if (!isPaymentCallbackUrl(url)) {
        return false;
      }

      const parsed = parsePaymentResultFromUrl(url);
      if (!parsed) {
        return false;
      }

      navigation.replace('PaymentResult', {
        ...parsed,
        purchaseType: purchaseType || parsed.purchaseType,
        provider: parsed.provider || provider,
      });
      return true;
    },
    [navigation, provider, purchaseType],
  );

  const keepPaymentInsideApp = useCallback(
    (url: string) => {
      console.log('[PaymentWebView] non-http URL blocked:', url);
      showToast(
        'Vui lòng hoàn tất thanh toán trong khung app để Mobile nhận kết quả.',
        'warning',
      );
    },
    [showToast],
  );

  const handleRequest = useCallback(
    (request: any) => {
      const nextUrl = String(request?.url || '');
      console.log('[PaymentWebView] onShouldStartLoadWithRequest:', nextUrl);

      if (isBlankWebViewUrl(nextUrl)) {
        return true;
      }

      if (navigateToResult(nextUrl)) {
        return false;
      }

      if (!isHttpUrl(nextUrl)) {
        keepPaymentInsideApp(nextUrl);
        return false;
      }

      return true;
    },
    [keepPaymentInsideApp, navigateToResult],
  );

  const handleOpenWindow = useCallback(
    ({nativeEvent}: any) => {
      const targetUrl = String(nativeEvent?.targetUrl || '');

      if (isBlankWebViewUrl(targetUrl)) {
        return;
      }

      if (navigateToResult(targetUrl)) {
        return;
      }

      if (isHttpUrl(targetUrl)) {
        webViewRef.current?.injectJavaScript(
          `window.location.href = ${JSON.stringify(targetUrl)}; true;`,
        );
        return;
      }

      keepPaymentInsideApp();
    },
    [keepPaymentInsideApp, navigateToResult],
  );

  const openPaymentInBrowser = useCallback(() => {
    if (!paymentUrl) {
      return;
    }

    Linking.openURL(paymentUrl).catch(() => {
      showToast('Không thể mở đường dẫn thanh toán', 'error');
    });
  }, [paymentUrl, showToast]);

  if (!paymentUrl) {
    return (
      <SafeAreaView
        style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
        edges={['top']}>
        <View
          style={[
            styles.header,
            {backgroundColor: colors.surface, borderBottomColor: colors.border},
          ]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-left" size={28} color={colors.icon} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, {color: colors.heading}]}>
            Thanh toán
          </Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.emptyState}>
          <Icon name="alert-circle-outline" size={42} color={Colors.error} />
          <Text style={[styles.emptyTitle, {color: colors.heading}]}>
            Không có đường dẫn thanh toán
          </Text>
          <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
            Vui lòng quay lại và tạo giao dịch mới.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!WebViewComponent) {
    return (
      <SafeAreaView
        style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
        edges={['top']}>
        <View
          style={[
            styles.header,
            {backgroundColor: colors.surface, borderBottomColor: colors.border},
          ]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <Icon name="chevron-left" size={28} color={colors.icon} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, {color: colors.heading}]}>
            Thanh toán
          </Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.emptyState}>
          <Icon name="web-off" size={46} color={Colors.warning} />
          <Text style={[styles.emptyTitle, {color: colors.heading}]}>
            Cần build lại ứng dụng
          </Text>
          <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
            WebView đã được thêm vào mã nguồn, nhưng bản app hiện tại chưa có
            module native. Hãy rebuild app để thanh toán hiển thị trực tiếp bên
            trong Mobile.
          </Text>
          <Button
            title="Mở trang thanh toán"
            onPress={openPaymentInBrowser}
            variant="primary"
            style={styles.emptyAction}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, {backgroundColor: colors.backgroundSecondary}]}
      edges={['top']}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
          },
        ]}>
        <TouchableOpacity
          onPress={() => {
            if (canGoBack) {
              webViewRef.current?.goBack();
              return;
            }
            navigation.goBack();
          }}
          style={styles.iconBtn}>
          <Icon name="chevron-left" size={28} color={colors.icon} />
        </TouchableOpacity>

        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, {color: colors.heading}]} numberOfLines={1}>
            {screenTitle}
          </Text>
          <Text style={[styles.headerSub, {color: colors.textSecondary}]} numberOfLines={1}>
            Cổng thanh toán bảo mật
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => webViewRef.current?.reload()}
          style={styles.iconBtn}>
          <Icon name="refresh" size={22} color={colors.icon} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.webShell,
          {
            backgroundColor: isDark ? '#020617' : '#FFFFFF',
            borderColor: colors.border,
          },
        ]}>
        <WebViewComponent
          ref={webViewRef}
          source={{uri: paymentUrl}}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          injectedJavaScriptBeforeContentLoaded={PAYMENT_WEBVIEW_INJECTED_JS}
          startInLoadingState
          onShouldStartLoadWithRequest={handleRequest}
          onOpenWindow={handleOpenWindow}
          onNavigationStateChange={(navState: any) => {
            setCanGoBack(Boolean(navState.canGoBack));
            navigateToResult(navState.url);
          }}
          onLoadStart={({nativeEvent}: any) => {
            if (navigateToResult(nativeEvent?.url)) {
              return;
            }
            setFailed(false);
            setLoading(true);
          }}
          onLoadEnd={() => setLoading(false)}
          onError={({nativeEvent}: any) => {
            if (navigateToResult(nativeEvent?.url)) {
              return;
            }
            setFailed(true);
            setLoading(false);
          }}
          renderLoading={() => (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.loaderText, {color: colors.textSecondary}]}>
                Đang mở cổng thanh toán...
              </Text>
            </View>
          )}
        />

        {loading ? (
          <View pointerEvents="none" style={styles.topLoadingBar}>
            <View style={styles.topLoadingFill} />
          </View>
        ) : null}
      </View>

      {failed ? (
        <View
          style={[
            styles.errorBanner,
            {
              backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2',
              borderColor: isDark ? 'rgba(248,113,113,0.35)' : '#FECACA',
            },
          ]}>
          <Icon name="wifi-alert" size={18} color={Colors.error} />
          <Text style={[styles.errorBannerText, {color: Colors.error}]}>
            Không tải được trang thanh toán. Kiểm tra mạng hoặc bấm làm mới.
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  iconBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  headerSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  webShell: {
    flex: 1,
    margin: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loaderText: {
    fontSize: 13,
    fontWeight: '600',
  },
  topLoadingBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(37,99,235,0.12)',
  },
  topLoadingFill: {
    width: '62%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    marginTop: Spacing.md,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: Spacing.lg,
    minWidth: 190,
  },
});
