import api from './api';

const CLIENT_TYPE = 'MOBILE';

const normalizePlanType = (type: any) => {
  const rawType = typeof type === 'string' ? type.toUpperCase() : '';

  if (rawType === 'WORKSPACE' || rawType === 'GROUP_WORKSPACE') {
    return 'GROUP';
  }

  if (rawType === 'USER') {
    return 'INDIVIDUAL';
  }

  return rawType || type;
};

const ENTITLEMENT_FORMAT_LABELS: Array<[key: string, label: string]> = [
  ['canProcessPdf', 'Xử lý PDF'],
  ['canProcessWord', 'Xử lý Word'],
  ['canProcessSlide', 'Xử lý Slide'],
  ['canProcessExcel', 'Xử lý Excel'],
  ['canProcessText', 'Xử lý văn bản'],
  ['canProcessImage', 'Xử lý Hình ảnh'],
  ['canProcessVideo', 'Xử lý Video'],
  ['canProcessAudio', 'Xử lý Âm thanh'],
];

const formatInteger = (value: number) => {
  try {
    return new Intl.NumberFormat('vi-VN').format(value);
  } catch {
    return String(value);
  }
};

const normalizePlanDuration = (durationInDay: any) => {
  const days = Number(durationInDay);

  if (!Number.isFinite(days) || days <= 0) {
    return 'không giới hạn';
  }

  if (days >= 999999) {
    return 'trọn đời';
  }

  return `${formatInteger(days)} ngày`;
};

const unwrapApiData = (response: any) => ({
  ...response,
  data: response?.data?.data ?? response?.data,
});

const buildPlanFeatures = (entitlement: any) => {
  const features = ENTITLEMENT_FORMAT_LABELS
    .filter(([key]) => Boolean(entitlement?.[key]))
    .map(([, label]) => label);

  const pushFeature = (enabled: boolean, label: string) => {
    if (enabled && !features.includes(label)) {
      features.push(label);
    }
  };

  pushFeature(
    Boolean(entitlement?.canCreateRoadMap || entitlement?.canCreateRoadmap),
    'Tạo lộ trình học tập',
  );

  pushFeature(Boolean(entitlement?.hasAiCompanionMode), 'AI Companion Mode');
  pushFeature(
    Boolean(entitlement?.hasAiContentStructuring || entitlement?.hasWorkspaceAnalytics),
    'AI Content Structuring',
  );
  pushFeature(
    Boolean(
      entitlement?.hasPersonalizedLearningAnalytic ||
        entitlement?.hasWorkspaceAnalytics
    ),
    'Phân tích học tập cá nhân',
  );
  pushFeature(
    Boolean(entitlement?.hasAiSummaryAndTextReading),
    'AI đọc & tóm tắt văn bản',
  );
  pushFeature(
    Boolean(entitlement?.hasAdvanceQuizConfig),
    'Cấu hình quiz nâng cao',
  );

  const planIncludedCredits = Number(entitlement?.planIncludedCredits || 0);
  if (planIncludedCredits > 0) {
    features.push(`Bao gồm ${formatInteger(planIncludedCredits)} credit`);
  }

  return features;
};

const mapPlan = (plan: any) => {
  const entitlement = plan?.entitlement || {};
  const planId = Number(plan?.planCatalogId ?? plan?.planId ?? plan?.id ?? 0);

  return {
    ...plan,
    id: planId,
    name: plan?.displayName ?? plan?.planName ?? plan?.name,
    type: normalizePlanType(plan?.planScope ?? plan?.type),
    planLevel: Number(plan?.planLevel ?? 0),
    durationInDay: Number(plan?.durationInDay ?? 0),
    durationLabel: normalizePlanDuration(plan?.durationInDay),
    entitlement,
    features: buildPlanFeatures(entitlement),
  };
};

const applyRecommendedFlag = (items: any[]) => {
  const sortedItems = [...items].sort(
    (left, right) => Number(left?.price ?? 0) - Number(right?.price ?? 0),
  );
  const firstPaidIndex = sortedItems.findIndex(
    item => Number(item?.price ?? 0) > 0,
  );

  return sortedItems.map((item, index) => ({
    ...item,
    recommended: firstPaidIndex >= 0 && index === firstPaidIndex,
  }));
};

const PaymentAPI = {
  getPlan: (id: number) =>
    api.get(`/plan-catalog/${id}`).then(res => ({
      ...unwrapApiData(res),
      data: mapPlan(res.data?.data),
    })),

  getPurchasablePlans: (type: 'INDIVIDUAL' | 'GROUP') =>
    (type === 'GROUP'
      ? api.get('/plan-catalog/active/group')
      : api.get('/plan-catalog/active/user')
    ).then(res => {
      const raw = res.data?.data;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

      return {
        ...unwrapApiData(res),
        data: applyRecommendedFlag(
          list
            .map(mapPlan)
            .filter(item => Number(item?.id || 0) > 0),
        ),
      };
    }),

  createMomoPayment: (
    planId: number,
    workspaceId?: number,
    extraSlotCount = 0,
  ) =>
    (workspaceId
      ? api.post(`/momo/create-workspace/${workspaceId}`, null, {
          params: {
            planId,
            clientType: CLIENT_TYPE,
            ...(extraSlotCount > 0 ? {extraSlotCount} : {}),
          },
        })
      : api.post(`/momo/create/${planId}`, null, {
          params: {clientType: CLIENT_TYPE},
        })
    ).then(unwrapApiData),

  createVnpayPayment: (
    planId: number,
    workspaceId?: number,
    extraSlotCount = 0,
  ) =>
    (workspaceId
      ? api.post(`/vnpay/create-workspace/${workspaceId}`, null, {
          params: {
            planId,
            clientType: CLIENT_TYPE,
            ...(extraSlotCount > 0 ? {extraSlotCount} : {}),
          },
        })
      : api.post(`/vnpay/create/${planId}`, null, {
          params: {clientType: CLIENT_TYPE},
        })
    ).then(unwrapApiData),

  createStripePayment: (
    planId: number,
    workspaceId?: number,
    extraSlotCount = 0,
  ) =>
    (workspaceId
      ? api.post(`/stripe/create-workspace/${workspaceId}`, null, {
          params: {
            planId,
            clientType: CLIENT_TYPE,
            ...(extraSlotCount > 0 ? {extraSlotCount} : {}),
          },
        })
      : api.post(`/stripe/create/${planId}`, null, {
          params: {clientType: CLIENT_TYPE},
        })
    ).then(unwrapApiData),

  createMomoCreditPayment: (creditPackageId: number, workspaceId?: number) =>
    api
      .post(`/momo/create-credit/${creditPackageId}`, null, {
        params: {
          clientType: CLIENT_TYPE,
          ...(workspaceId ? {workspaceId} : {}),
        },
      })
      .then(unwrapApiData),

  createVnpayCreditPayment: (creditPackageId: number, workspaceId?: number) =>
    api
      .post(`/vnpay/create-credit/${creditPackageId}`, null, {
        params: {
          clientType: CLIENT_TYPE,
          ...(workspaceId ? {workspaceId} : {}),
        },
      })
      .then(unwrapApiData),

  createStripeCreditPayment: (creditPackageId: number, workspaceId?: number) =>
    api
      .post(`/stripe/create-credit/${creditPackageId}`, null, {
        params: {
          clientType: CLIENT_TYPE,
          ...(workspaceId ? {workspaceId} : {}),
        },
      })
      .then(unwrapApiData),

  createMomoCustomCreditPayment: (creditUnits: number, workspaceId?: number) =>
    api
      .post('/momo/create-custom-credit', null, {
        params: {
          creditUnits,
          clientType: CLIENT_TYPE,
          ...(workspaceId ? {workspaceId} : {}),
        },
      })
      .then(unwrapApiData),

  createVnPayCustomCreditPayment: (creditUnits: number, workspaceId?: number) =>
    api
      .post('/vnpay/create-custom-credit', null, {
        params: {
          creditUnits,
          clientType: CLIENT_TYPE,
          ...(workspaceId ? {workspaceId} : {}),
        },
      })
      .then(unwrapApiData),

  createStripeCustomCreditPayment: (creditUnits: number, workspaceId?: number) =>
    api
      .post('/stripe/create-custom-credit', null, {
        params: {
          creditUnits,
          clientType: CLIENT_TYPE,
          ...(workspaceId ? {workspaceId} : {}),
        },
      })
      .then(unwrapApiData),
};

export default PaymentAPI;
