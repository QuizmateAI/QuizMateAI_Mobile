import api from './api';
import {
  normalizeCreditSummary,
  normalizeCreditTransactions,
  normalizeCurrentPlan,
} from '../utils/accountSummary';

const ManagementSystemAPI = {
  getMyPermissions: () => api.get('/management/me/permissions'),

  getAllUsers: (page = 0, size = 10) =>
    api.get(`/management/users?page=${page}&size=${size}`),

  updateUserStatus: (userId: number, status: string) =>
    api.put(`/management/users/${userId}/status?status=${status}`),

  getUserById: (userId: number) => api.get(`/management/users/${userId}`),

  getWorkspacesByUserId: (userId: number, page = 0, size = 20) =>
    api.get(`/management/users/${userId}/workspaces?page=${page}&size=${size}`),

  getGroupsByUserId: (userId: number) =>
    api.get(`/management/users/${userId}/groups`),

  getUserSubscription: (userId: number) =>
    api.get(`/management/users/${userId}/subscription`),

  getGroupSubscription: (groupId: number) =>
    api.get(`/management/groups/${groupId}/subscription`),

  getAllGroups: (page = 0, size = 10) =>
    api.get(`/management/groups?page=${page}&size=${size}`),

  getGroupDetail: (groupId: number) => api.get(`/management/groups/${groupId}`),

  createAdmin: (data: any) => api.post('/management/admins', data),

  getAllSystemUsers: (page = 0, size = 100) =>
    api.get(`/rbac/system/users?page=${page}&size=${size}`),

  listPermissions: (page = 0, size = 100) =>
    api.get(`/rbac/system/permissions?page=${page}&size=${size}`),

  getUserPermissions: (userId: number) =>
    api.get(`/rbac/system/users/${userId}/permissions`),

  syncUserPermissions: (userId: number, permissionCodes: string[]) => {
    const params = new URLSearchParams();
    const codes = Array.isArray(permissionCodes) ? permissionCodes : [];
    codes.forEach(code => params.append('permissionCodes', String(code)));

    const query = params.toString();
    const url = `/rbac/system/users/${userId}/permissions${
      query ? `?${query}` : ''
    }`;
    return api.put(url);
  },

  grantPermissionToUser: (userId: number, permissionCode: string) =>
    api.post(
      `/rbac/system/users/${userId}/permissions/${encodeURIComponent(permissionCode)}`,
    ),

  revokePermissionFromUser: (userId: number, permissionCode: string) =>
    api.delete(
      `/rbac/system/users/${userId}/permissions/${encodeURIComponent(permissionCode)}`,
    ),

  getAuditLogs: (actorId?: number, action?: string, page = 0, size = 50) => {
    const params = new URLSearchParams();
    if (actorId != null) {
      params.append('actorId', String(actorId));
    }
    if (action) {
      params.append('action', action);
    }
    params.append('page', String(page));
    params.append('size', String(size));

    return api.get(`/rbac/system/audit-logs?${params.toString()}`);
  },

  getGroupLogs: (groupId: number) => api.get(`/management/groups/${groupId}/logs`),

  getAllPlans: () => api.get('/api/plan-catalog/all'),

  getPlanById: (planId: number) => api.get(`/api/plan-catalog/${planId}`),

  createPlan: (data: any) => api.post('/api/plan-catalog/create', data),

  updatePlan: (planId: number, data: any) => api.put(`/api/plan-catalog/${planId}`, data),

  deletePlan: (planId: number) => api.delete(`/api/plan-catalog/${planId}`),

  updatePlanStatus: (planId: number, status: string) =>
    api.patch(`/api/plan-catalog/${planId}/status`, {status}),

  getActiveUserPlans: () => api.get('/api/plan-catalog/active/user'),

  getActiveGroupPlan: () => api.get('/api/plan-catalog/active/group'),

  getPurchasablePlans: (type: string) =>
    api.get(
      type === 'GROUP'
        ? '/api/plan-catalog/active/group'
        : '/api/plan-catalog/active/user',
    ),

  getCurrentUserPlan: () =>
    api.get('/api/user/current-plan').then(res => ({
      ...res,
      data: normalizeCurrentPlan(res.data?.data),
    })),

  getAllCreditPackages: () => api.get('/api/credit-package/all'),

  getCreditPackageById: (id: number) => api.get(`/api/credit-package/${id}`),

  createCreditPackage: (data: any) =>
    api.post('/api/credit-package/create', data),

  updateCreditPackage: (id: number, data: any) =>
    api.put(`/api/credit-package/${id}`, data),

  updateCreditPackageStatus: (id: number, data: any) =>
    api.patch(`/api/credit-package/${id}/status`, data),

  deleteCreditPackage: (id: number) => api.delete(`/api/credit-package/${id}`),

  getPurchaseableCreditPackages: () =>
    api.get('/api/credit-package/purchaseable'),

  getUserPayments: (page = 0, size = 10) =>
    api.get(`/payment/user?page=${page}&size=${size}`),

  getMyWallet: () =>
    api.get('/api/credit-wallet/me').then(res => ({
      ...res,
      data: normalizeCreditSummary(res.data?.data),
    })),

  getMyWalletTransactions: (page = 0, size = 10) =>
    api
      .get(`/api/credit-wallet/me/transactions?page=${page}&size=${size}`)
      .then(res => ({
        ...res,
        data: normalizeCreditTransactions(res.data?.data),
      })),

  getGroupWorkspaceWallet: (workspaceId: number) =>
    api.get(`/api/credit-wallet/group-workspace/${workspaceId}`).then(res => ({
      ...res,
      data: normalizeCreditSummary(res.data?.data),
    })),

  getGroupWorkspaceWalletTransactions: (
    workspaceId: number,
    page = 0,
    size = 10,
  ) =>
    api
      .get(
        `/api/credit-wallet/group-workspace/${workspaceId}/transactions?page=${page}&size=${size}`,
      )
      .then(res => ({
        ...res,
        data: normalizeCreditTransactions(res.data?.data),
      })),

  getWorkspacePayments: (workspaceId: number, page = 0, size = 10) =>
    api.get(`/api/payment/workspace/${workspaceId}?page=${page}&size=${size}`),
};

export default ManagementSystemAPI;
