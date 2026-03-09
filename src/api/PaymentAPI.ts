import api from './api';

const PaymentAPI = {
  getPlan: (id: number) =>
    api.get(`/api/plan/${id}`).then(res => ({
      ...res,
      data: {
        ...res.data?.data,
        id: res.data?.data?.planId,
        name: res.data?.data?.planName,
      },
    })),
  getPurchasablePlans: (type: 'INDIVIDUAL' | 'GROUP') =>
    api.get(`/api/plan/purchasable?type=${type}`).then(res => ({
      ...res,
      data: (res.data?.data || []).map((plan: any) => ({
        ...plan,
        id: plan.planId,
        name: plan.planName,
      })),
    })),
  createMomoPayment: (planId: number, groupId?: number) =>
    api.post(
      `/api/momo/create/${planId}${groupId ? `?groupId=${groupId}` : ''}`,
    ),
  createVnpayPayment: (planId: number, groupId?: number) =>
    api.post(
      `/api/vnpay/create/${planId}${groupId ? `?groupId=${groupId}` : ''}`,
    ),
};

export default PaymentAPI;
