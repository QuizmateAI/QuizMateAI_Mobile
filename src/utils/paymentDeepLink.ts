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
  '/momo/return',
  '/vnpay/return',
  '/stripe/return',
];

const getQueryValue = (params: URLSearchParams, keys: string[]) => {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return '';
};

const hasQueryValue = (params: URLSearchParams, keys: string[]) =>
  keys.some(key => params.has(key));

export const isPaymentCallbackUrl = (url: string) => {
  if (!url) {
    return false;
  }
  const normalized = String(url).toLowerCase();

  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const pathWithHost = `/${host}${path}`;
    const matchesResultPath = PAYMENT_RESULT_PATHS.some(
      resultPath => path.includes(resultPath) || pathWithHost.includes(resultPath),
    );

    if (parsed.protocol.toLowerCase() === 'quizmateai:' && host === 'payment') {
      return true;
    }

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
      normalized.includes('quizmateai://payment') ||
      normalized.includes('payment-result') ||
      normalized.includes('/payment/result') ||
      normalized.includes('/payments/result') ||
      normalized.includes('vnp_responsecode=') ||
      normalized.includes('resultcode=') ||
      normalized.includes('session_id=')
    );
  }
};

export const parsePaymentResultFromUrl = (url: string): PaymentResultPayload | null => {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;
    const path = parsed.pathname.toLowerCase();

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
