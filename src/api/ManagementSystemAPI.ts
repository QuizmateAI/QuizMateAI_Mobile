import api from './api';

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

  getAllPlans: () => api.get('/plan-catalog/all'),

  getPlanById: (planId: number) => api.get(`/plan-catalog/${planId}`),

  createPlan: (data: any) => api.post('/plan-catalog/create', data),

  updatePlan: (planId: number, data: any) => api.put(`/plan-catalog/${planId}`, data),

  deletePlan: (planId: number) => api.delete(`/plan-catalog/${planId}`),

  updatePlanStatus: (planId: number, status: string) =>
    api.patch(`/plan-catalog/${planId}/status`, {status}),

  getActiveUserPlans: () => api.get('/plan-catalog/active/user'),

  getActiveGroupPlan: () => api.get('/plan-catalog/active/group'),

  getPurchasablePlans: (type: string) => api.get(`/plan/purchasable?type=${type}`),

  getAllCreditPackages: () => api.get('/credit-package/all'),

  getCreditPackageById: (id: number) => api.get(`/credit-package/${id}`),

  createCreditPackage: (data: any) => api.post('/credit-package/create', data),

  updateCreditPackage: (id: number, data: any) =>
    api.put(`/credit-package/${id}`, data),

  updateCreditPackageStatus: (id: number, data: any) =>
    api.patch(`/credit-package/${id}/status`, data),

  deleteCreditPackage: (id: number) => api.delete(`/credit-package/${id}`),

  getPurchaseableCreditPackages: () => api.get('/credit-package/purchaseable'),

  getUserPayments: (page = 0, size = 10) =>
    api.get(`/payment/user?page=${page}&size=${size}`),

  getMyWallet: () => api.get('/credit-wallet/me'),
};

export default ManagementSystemAPI;
