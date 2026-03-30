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

const unwrapApiData = (response: any) => ({
  ...response,
  data: response?.data?.data ?? response?.data,
});

const mapPlan = (plan: any) => {
  const entitlement = plan?.entitlement || {};
  const features = [
    entitlement?.canProcessPdf ? 'Process PDF files' : null,
    entitlement?.canProcessWord ? 'Process Word files' : null,
    entitlement?.canProcessSlide ? 'Process Slides' : null,
    entitlement?.canProcessExcel ? 'Process Excel files' : null,
    entitlement?.canProcessImage ? 'Process images' : null,
    entitlement?.canProcessAudio ? 'Process audio' : null,
    entitlement?.canProcessVideo ? 'Process video' : null,
    entitlement?.hasAdvanceQuizConfig ? 'Advanced quiz settings' : null,
    entitlement?.hasAiCompanionMode ? 'AI companion mode' : null,
    entitlement?.hasWorkspaceAnalytics ? 'Workspace analytics' : null,
  ].filter(Boolean);

  return {
    ...plan,
    id: plan?.planCatalogId ?? plan?.planId ?? plan?.id,
    name: plan?.displayName ?? plan?.planName ?? plan?.name,
    type: normalizePlanType(plan?.planScope ?? plan?.type),
    duration: plan?.duration ?? 'month',
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
};

export default PaymentAPI;
