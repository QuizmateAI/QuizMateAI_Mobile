type PaymentResultPayload = {
  status: 'success' | 'failed' | 'processing';
  orderId?: string;
  amount?: number;
  orderInfo?: string;
  transId?: string;
  payType?: string;
  responseTime?: string;
  purchaseType?: 'plan' | 'credit';
  message?: string;
  provider?: string;
};

const SUCCESS_VALUES = new Set(['0', '00', 'SUCCESS', 'SUCCEED', 'COMPLETED', 'PAID']);
const FAILED_VALUES = new Set(['FAILED', 'FAIL', 'CANCEL', 'CANCELLED', 'CANCELED']);

const PAYMENT_RESULT_PATHS = [
  '/payment-result',
  '/payment/result',
  '/payment/results',
  '/payments/result',
  '/payments/results',
  '/payment/callback',
  '/api/momo/return',
  '/api/vnpay/return',
  '/api/stripe/return',
  '/api/v1/momo/return',
  '/api/v1/vnpay/return',
  '/api/v1/stripe/return',
  '/momo/return',
  '/vnpay/return',
  '/stripe/return',
];

type ParamLike = {
  get: (key: string) => string | null;
  has: (key: string) => boolean;
};

const getQueryValue = (params: ParamLike, keys: string[]) => {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return '';
};

const hasQueryValue = (params: ParamLike, keys: string[]) =>
  keys.some(key => params.has(key));

export const isPaymentCallbackUrl = (url: string) => {
  if (!url) {
    return false;
  }
  const normalized = String(url).toLowerCase();

  // Shortcut: app's own deep link scheme — covers Hermes URL-parser quirks
  // where `host` may not be 'payment' for non-special schemes.
  if (normalized.startsWith('quizmateai:')) {
    console.log('[isPaymentCallbackUrl] matched quizmateai scheme:', url);
    return true;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const pathWithHost = `/${host}${path}`;
    const matchesResultPath = PAYMENT_RESULT_PATHS.some(
      resultPath => path.includes(resultPath) || pathWithHost.includes(resultPath),
    );

    if (matchesResultPath) {
      return true;
    }

    return (
      hasQueryValue(parsed.searchParams, ['vnp_ResponseCode', 'vnp_responsecode']) ||
      hasQueryValue(parsed.searchParams, ['resultCode', 'resultcode']) ||
      parsed.searchParams.has('session_id')
    );
  } catch {
    return (
      normalized.includes('payment-result') ||
      normalized.includes('/payment/result') ||
      normalized.includes('/payments/result') ||
      normalized.includes('vnp_responsecode=') ||
      normalized.includes('resultcode=') ||
      normalized.includes('session_id=')
    );
  }
};

const buildSearchParamsFromRawUrl = (url: string): ParamLike => {
  const map = new Map<string, string>();
  const queryStart = url.indexOf('?');
  if (queryStart < 0) {
    return {get: k => map.get(k) ?? null, has: k => map.has(k)};
  }
  const hashStart = url.indexOf('#', queryStart);
  const queryString =
    hashStart >= 0 ? url.slice(queryStart + 1, hashStart) : url.slice(queryStart + 1);

  for (const pair of queryString.split('&')) {
    if (!pair) continue;
    const eqIdx = pair.indexOf('=');
    let key: string;
    let value: string;
    if (eqIdx < 0) {
      key = pair;
      value = '';
    } else {
      key = pair.slice(0, eqIdx);
      value = pair.slice(eqIdx + 1);
    }
    try {
      key = decodeURIComponent(key.replace(/\+/g, ' '));
      value = decodeURIComponent(value.replace(/\+/g, ' '));
    } catch {
      // keep raw on decode failure
    }
    if (!map.has(key)) {
      map.set(key, value);
    }
  }
  return {get: k => map.get(k) ?? null, has: k => map.has(k)};
};

export const parsePaymentResultFromUrl = (url: string): PaymentResultPayload | null => {
  if (!url) {
    return null;
  }

  try {
    const isAppDeepLink = String(url).toLowerCase().startsWith('quizmateai:');
    let params: ParamLike;
    let path = '';

    if (isAppDeepLink) {
      // Bypass URL constructor for app's deep link to avoid Hermes
      // non-special-scheme parsing quirks that may drop query string.
      params = buildSearchParamsFromRawUrl(url);
      console.log(
        '[parsePaymentResultFromUrl] deep-link parse: status=',
        params.get('status'),
        'orderId=',
        params.get('orderId'),
      );
    } else {
      const parsed = new URL(url);
      params = parsed.searchParams;
      path = parsed.pathname.toLowerCase();
    }

    const resultCode = getQueryValue(params, [
      'resultCode',
      'resultcode',
      'vnp_ResponseCode',
      'vnp_responsecode',
      'status',
      'paymentStatus',
    ]);
    const explicitStatus = getQueryValue(params, ['status']);

    const successByCode = SUCCESS_VALUES.has(String(resultCode).toUpperCase());
    const successByStatus = ['success', 'completed', 'paid'].includes(
      String(explicitStatus).toLowerCase(),
    );
    const failedByCode = FAILED_VALUES.has(String(resultCode).toUpperCase());
    const failedByStatus = ['failed', 'fail', 'cancel', 'cancelled', 'canceled'].includes(
      String(explicitStatus).toLowerCase(),
    );

    const orderInfo = getQueryValue(params, [
      'orderInfo',
      'vnp_OrderInfo',
      'message',
      'localMessage',
    ]);
    const message = getQueryValue(params, ['message', 'localMessage']);

    const purchaseHint = `${orderInfo} ${getQueryValue(params, ['targetType', 'purchaseType'])}`.toLowerCase();
    const purchaseType: 'plan' | 'credit' = purchaseHint.includes('credit')
      ? 'credit'
      : 'plan';

    const vnpAmountRaw = getQueryValue(params, ['vnp_Amount', 'vnp_amount']);
    const amountRaw = getQueryValue(params, ['amount', 'vnp_Amount', 'vnp_amount']);
    const amountNumber = Number(amountRaw);
    const normalizedAmount = Number.isFinite(amountNumber)
      ? vnpAmountRaw
        ? Math.floor(amountNumber / 100)
        : amountNumber
      : undefined;
    const providerFromPath = path.includes('vnpay')
      ? 'vnpay'
      : path.includes('momo')
      ? 'momo'
      : path.includes('stripe') || params.get('session_id')
      ? 'stripe'
      : '';
    const provider = getQueryValue(params, ['provider', 'gateway', 'paymentMethod', 'partnerCode']) ||
      providerFromPath;

    return {
      status: successByCode || successByStatus
        ? 'success'
        : failedByCode || failedByStatus
        ? 'failed'
        : 'processing',
      orderId: getQueryValue(params, ['orderId', 'orderid', 'vnp_TxnRef', 'vnp_txnref', 'requestId']),
      amount: normalizedAmount,
      orderInfo,
      transId: getQueryValue(params, ['transId', 'transid', 'vnp_TransactionNo', 'vnp_transactionno']),
      payType: getQueryValue(params, ['payType', 'paytype', 'vnp_CardType', 'vnp_cardtype', 'partnerCode']),
      responseTime: getQueryValue(params, ['responseTime', 'responsetime', 'vnp_PayDate', 'vnp_paydate']),
      purchaseType,
      message,
      provider,
    };
  } catch {
    return null;
  }
};
