type PaymentResultPayload = {
  status: 'success' | 'failed';
  orderId?: string;
  amount?: number;
  orderInfo?: string;
  transId?: string;
  payType?: string;
  responseTime?: string;
  purchaseType?: 'plan' | 'credit';
};

const SUCCESS_VALUES = new Set(['0', '00', 'SUCCESS', 'SUCCEED', 'COMPLETED']);

const getQueryValue = (params: URLSearchParams, keys: string[]) => {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return '';
};

export const isPaymentCallbackUrl = (url: string) => {
  if (!url) {
    return false;
  }
  const normalized = String(url).toLowerCase();
  return (
    normalized.includes('payment-result') ||
    normalized.includes('payment/callback') ||
    normalized.includes('vnp_responsecode') ||
    normalized.includes('resultcode=')
  );
};

export const parsePaymentResultFromUrl = (url: string): PaymentResultPayload | null => {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const params = parsed.searchParams;

    const resultCode = getQueryValue(params, ['resultCode', 'vnp_ResponseCode', 'status']);
    const explicitStatus = getQueryValue(params, ['status']);

    const successByCode = SUCCESS_VALUES.has(String(resultCode).toUpperCase());
    const successByStatus = ['success', 'completed', 'paid'].includes(
      String(explicitStatus).toLowerCase(),
    );

    const orderInfo = getQueryValue(params, [
      'orderInfo',
      'vnp_OrderInfo',
      'message',
      'localMessage',
    ]);

    const purchaseHint = `${orderInfo} ${getQueryValue(params, ['targetType', 'purchaseType'])}`.toLowerCase();
    const purchaseType: 'plan' | 'credit' = purchaseHint.includes('credit')
      ? 'credit'
      : 'plan';

    const amountRaw = getQueryValue(params, ['amount', 'vnp_Amount']);
    const amountNumber = Number(amountRaw);
    const normalizedAmount = Number.isFinite(amountNumber)
      ? amountRaw.includes('vnp_') || amountRaw.endsWith('00')
        ? Math.floor(amountNumber / 100)
        : amountNumber
      : undefined;

    return {
      status: successByCode || successByStatus ? 'success' : 'failed',
      orderId: getQueryValue(params, ['orderId', 'vnp_TxnRef', 'requestId']),
      amount: normalizedAmount,
      orderInfo,
      transId: getQueryValue(params, ['transId', 'vnp_TransactionNo']),
      payType: getQueryValue(params, ['payType', 'vnp_CardType', 'partnerCode']),
      responseTime: getQueryValue(params, ['responseTime', 'vnp_PayDate']),
      purchaseType,
    };
  } catch {
    return null;
  }
};
