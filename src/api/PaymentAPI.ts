import api from './api';

const normalizePlanType = (type: any) => {
  const rawType = typeof type === 'string' ? type.toUpperCase() : '';

  if (rawType === 'WORKSPACE') {
    return 'GROUP';
  }

  if (rawType === 'USER') {
    return 'INDIVIDUAL';
  }

  return rawType || type;
};

const ENTITLEMENT_FEATURE_LABELS: Array<[key: string, label: string]> = [
  ['canProcessPdf', 'Xử lý PDF'],
  ['canProcessWord', 'Xử lý Word'],
  ['canProcessSlide', 'Xử lý slide'],
  ['canProcessExcel', 'Xử lý Excel'],
  ['canProcessImage', 'Xử lý hình ảnh'],
  ['canProcessAudio', 'Xử lý audio'],
  ['canProcessVideo', 'Xử lý video'],
  ['hasAdvanceQuizConfig', 'Tùy chỉnh quiz nâng cao'],
  ['hasAiCompanionMode', 'Làm quiz bằng giọng nói'],
  ['hasWorkspaceAnalytics', 'Thống kê workspace'],
];

const normalizePlanDuration = (duration: any) => {
  if (duration == null || duration === '') {
    return 'tháng';
  }

  if (typeof duration === 'number') {
    return `${duration} tháng`;
  }

  const rawDuration = String(duration).trim();
  const normalizedDuration = rawDuration.toLowerCase();

  if (normalizedDuration === 'month' || normalizedDuration === 'monthly') {
    return 'tháng';
  }

  if (normalizedDuration === 'year' || normalizedDuration === 'yearly' || normalizedDuration === 'annual') {
    return 'năm';
  }

  if (normalizedDuration === 'week' || normalizedDuration === 'weekly') {
    return 'tuần';
  }

  if (/^\d+$/.test(rawDuration)) {
    return `${rawDuration} tháng`;
  }

  return rawDuration;
};

const unwrapApiData = (response: any) => ({
  ...response,
  data: response?.data?.data ?? response?.data,
});

const mapPlan = (plan: any) => {
  const entitlement = plan?.entitlement || {};
  const features = ENTITLEMENT_FEATURE_LABELS
    .filter(([key]) => Boolean(entitlement?.[key]))
    .map(([, label]) => label);

  return {
    ...plan,
    id: plan?.planCatalogId ?? plan?.planId ?? plan?.id,
    name: plan?.displayName ?? plan?.planName ?? plan?.name,
    type: normalizePlanType(plan?.planScope ?? plan?.type),
    duration: plan?.duration ?? 'month',
    durationLabel: normalizePlanDuration(plan?.duration),
    features,
  };
};

const PaymentAPI = {
  getPlan: (id: number) =>
    api.get(`/api/plan-catalog/${id}`).then(res => ({
      ...unwrapApiData(res),
      data: mapPlan(res.data?.data),
    })),
  getPurchasablePlans: (type: 'INDIVIDUAL' | 'GROUP') =>
    (type === 'GROUP'
      ? api.get('/api/plan-catalog/active/group')
      : api.get('/api/plan-catalog/active/user')
    ).then(res => {
      const raw = res.data?.data;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      return {
        ...unwrapApiData(res),
        data: list.map(mapPlan),
      };
    }),
  createMomoPayment: (planId: number, groupId?: number) =>
    (groupId
      ? api.post(`/api/momo/create-workspace/${groupId}`)
      : api.post(`/api/momo/create/${planId}`)
    ).then(unwrapApiData),
  createVnpayPayment: (planId: number, groupId?: number) =>
    (groupId
      ? api.post(`/api/vnpay/create-workspace/${groupId}`)
      : api.post(`/api/vnpay/create/${planId}`)
    ).then(unwrapApiData),
  createMomoCreditPayment: (creditPackageId: number, workspaceId?: number) =>
    api
      .post(
        `/api/momo/create-credit/${creditPackageId}${
          workspaceId ? `?workspaceId=${workspaceId}` : ''
        }`,
      )
      .then(unwrapApiData),
  createVnpayCreditPayment: (creditPackageId: number, workspaceId?: number) =>
    api
      .post(
        `/api/vnpay/create-credit/${creditPackageId}${
          workspaceId ? `?workspaceId=${workspaceId}` : ''
        }`,
      )
      .then(unwrapApiData),
};

export default PaymentAPI;
