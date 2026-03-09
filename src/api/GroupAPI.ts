import api from './api';

const GroupAPI = {
  getJoined: () => api.get('/group/joined'),
  create: (data: {name: string; description?: string}) =>
    api.post('/group', data),
  getMembers: (groupId: number) => api.get(`/group/${groupId}/members`),
  sendInvitation: (groupId: number, data: {email: string}) =>
    api.post(`/group/${groupId}/invite`, data),
  grantUpload: (groupId: number, memberId: number) =>
    api.put(`/group/${groupId}/member/${memberId}/grant-upload`),
  revokeUpload: (groupId: number, memberId: number) =>
    api.put(`/group/${groupId}/member/${memberId}/revoke-upload`),
  updateRole: (groupId: number, memberId: number, role: string) =>
    api.put(`/group/${groupId}/member/${memberId}/role`, {role}),
  removeMember: (groupId: number, memberId: number) =>
    api.delete(`/group/${groupId}/member/${memberId}`),
};

export default GroupAPI;
