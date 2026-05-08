import api from './api';

const mapGroup = (item: any) => ({
  ...item,
  id: item?.groupId ?? item?.id,
  name: item?.groupName ?? item?.name,
  groupName: item?.groupName ?? item?.name,
  role: item?.memberRole ?? item?.role,
});

const normalizeMembers = (payload: any) => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.content)
    ? payload.data.content
    : Array.isArray(payload?.content)
    ? payload.content
    : [];

  return list.map((m: any) => ({
    ...m,
    id: m?.groupMemberId ?? m?.id,
    userId: m?.userId ?? m?.user?.userId,
    fullName: m?.fullName ?? m?.user?.fullName,
    email: m?.email ?? m?.user?.email,
    role: m?.role ?? m?.memberRole,
  }));
};

const unwrapMembersPayload = (res: any) => normalizeMembers(res?.data?.data ?? res?.data);

const GroupAPI = {
  getJoined: () =>
    api.get('/api/group/me/joined').then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapGroup),
    })),
  getPublicGroups: (search?: string) =>
    api.get('/api/group/public', {
      params: search?.trim() ? {search: search.trim()} : undefined,
    }).then(res => {
      const payload = res.data?.data ?? res.data;
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.content)
        ? payload.content
        : Array.isArray(payload?.items)
        ? payload.items
        : [];
      return {
        ...res,
        data: list.map(mapGroup),
      };
    }),
  joinPublicGroup: (groupId: number) =>
    api.post(`/api/group/${groupId}/join`).then(res => ({
      ...res,
      data: res.data?.data || res.data,
    })),
  create: (data: {name: string; description?: string; fieldId?: number}) =>
    api.post('/api/workspace/create/group', {
      name: data.name,
      description: data.description,
      fieldId: data.fieldId ?? 1,
    }).then(res => ({
      ...res,
      data: res.data?.data || res.data,
    })),
  getMembers: (groupId: number) =>
    api.get(`/api/group/${groupId}/members`, {
      params: {page: 0, size: 100},
    }).then(res => ({
      ...res,
      data: unwrapMembersPayload(res),
    })).catch(() =>
      api.get(`/api/group/${groupId}/members`).then(res => ({
        ...res,
        data: unwrapMembersPayload(res),
      }))
    ),
  getDashboardSummary: (groupId: number) =>
    api.get(`/api/group/${groupId}/dashboard/summary`).then(res => ({
      ...res,
      data: res.data?.data || null,
    })),
  getWorkspaceDetail: (groupId: number) =>
    api.get(`/api/workspace/${groupId}`).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  toggleVisibility: (groupId: number) =>
    api.put(`/api/group/${groupId}/visibility`).then(res => ({
      ...res,
      data: res.data?.data || null,
    })),
  deleteGroup: (groupId: number, confirmText = 'delete group') =>
    api.delete(`/api/group/${groupId}`, {
      data: {confirmText},
    }),
  sendInvitation: (groupId: number, data: {email: string}) =>
    api.post(`/api/group/${groupId}/invitation`, data),
  getPendingInvitations: (groupId: number) =>
    api.get(`/api/group/${groupId}/invitations`).then(res => ({
      ...res,
      data: res.data?.data?.invitations || [],
      count: Number(res.data?.data?.count || 0),
    })),
  cancelInvitation: (groupId: number, invitationId: number | string) =>
    api.delete(`/api/group/${groupId}/invitations/${encodeURIComponent(String(invitationId))}`),
  resendInvitation: (groupId: number, invitationId: number | string, email?: string) => {
    const id = encodeURIComponent(String(invitationId));
    if (String(email || '').trim().length > 0) {
      return api.post(`/api/group/${groupId}/invitations/${id}/resend`, {
        email: String(email || '').trim(),
      });
    }
    return api.post(`/api/group/${groupId}/invitations/${id}/resend`);
  },
  grantUpload: (groupId: number, memberId: number) =>
    api.post(`/api/group/${groupId}/members/${memberId}/grant-upload`),
  revokeUpload: (groupId: number, memberId: number) =>
    api.delete(`/api/group/${groupId}/members/${memberId}/grant-upload`),
  updateRole: (groupId: number, memberId: number, role: string) =>
    api.put(`/api/group/${groupId}/members/${memberId}/role?roleName=${role}`),
  removeMember: (groupId: number, memberId: number) =>
    api.delete(`/api/group/${groupId}/members/${memberId}`),
  getOverallRanking: (groupId: number) =>
    api.get(`/api/group/${groupId}/ranking/overall`).then(res => ({
      ...res,
      data: res.data?.data || null,
    })),
  getRankingMemberDetail: (groupId: number, userId: number) =>
    api.get(`/api/group/${groupId}/ranking/overall/members/${userId}`).then(res => ({
      ...res,
      data: res.data?.data || null,
    })),
  getMemberDashboardCards: (groupId: number, page = 0, size = 20) =>
    api.get(`/api/group/${groupId}/dashboard/members`, {
      params: {page, size},
    }).then(res => ({
      ...res,
      data: (res.data?.data?.content || []).map((m: any) => ({
        ...m,
        id: m?.groupMemberId ?? m?.id,
      })),
    })),
  getMemberDashboardDetail: (groupId: number, memberId: number) =>
    api.get(`/api/group/${groupId}/dashboard/members/${memberId}`).then(res => ({
      ...res,
      data: res.data?.data || null,
    })),
  getGroupLogs: (groupId: number) =>
    api.get(`/api/group/${groupId}/logs`).then(res => ({
      ...res,
      data: res.data?.data || [],
    })),
  getMyPermissions: (groupId: number) =>
    api.get(`/api/group/${groupId}/me/permissions`).then(res => ({
      ...res,
      data: res.data?.data || null,
    })),
};

export default GroupAPI;
