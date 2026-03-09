import api from './api';

const PaymentAPI = {
  getPlan: (id: number) => api.get(`/plan/${id}`),
  getPurchasablePlans: () => api.get('/plan/purchasable'),
  createMomoPayment: (planId: number) =>
    api.post(`/momo/create/${planId}`),
  createVnpayPayment: (planId: number) =>
    api.post(`/vnpay/create/${planId}`),
};

export default PaymentAPI;
