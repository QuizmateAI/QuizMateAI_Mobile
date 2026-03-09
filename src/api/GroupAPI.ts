import api from './api';

const mapGroup = (item: any) => ({
  ...item,
  id: item?.groupId ?? item?.id,
  name: item?.groupName ?? item?.name,
  groupName: item?.groupName ?? item?.name,
  role: item?.memberRole ?? item?.role,
});

const GroupAPI = {
  getJoined: () =>
    api.get('/api/group/me/joined').then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapGroup),
    })),
  create: (data: {name: string; description?: string; fieldId?: number}) =>
    api.post('/api/group/create', {
      groupName: data.name,
      description: data.description,
      fieldId: data.fieldId ?? 1,
    }),
  getMembers: (groupId: number) =>
    api.get(`/api/group/${groupId}/members`).then(res => ({
      ...res,
      data: (res.data?.data?.content || []).map((m: any) => ({
        ...m,
        id: m?.groupMemberId ?? m?.id,
      })),
    })),
  sendInvitation: (groupId: number, data: {email: string}) =>
    api.post(`/api/group/${groupId}/invitation`, data),
  grantUpload: (groupId: number, memberId: number) =>
    api.post(`/api/group/${groupId}/members/${memberId}/grant-upload`),
  revokeUpload: (groupId: number, memberId: number) =>
    api.delete(`/api/group/${groupId}/members/${memberId}/grant-upload`),
  updateRole: (groupId: number, memberId: number, role: string) =>
    api.put(`/api/group/${groupId}/members/${memberId}/role?roleName=${role}`),
  removeMember: (groupId: number, memberId: number) =>
    api.delete(`/api/group/${groupId}/members/${memberId}`),
};

export default GroupAPI;
