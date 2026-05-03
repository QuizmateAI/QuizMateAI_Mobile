import api from './api';

const unwrapData = (res: any) => res?.data?.data ?? res?.data ?? null;

const normalizeList = (payload: any) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.content)) {
    return payload.content;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.data?.content)) {
    return payload.data.content;
  }
  return [];
};

const ChallengeAPI = {
  list: (workspaceId: number, status?: string) =>
    api
      .get(`/api/group/${workspaceId}/challenges`, {
        params: status ? {status} : undefined,
      })
      .then(res => ({
        ...res,
        data: normalizeList(unwrapData(res)),
      })),
  detail: (workspaceId: number, eventId: number) =>
    api.get(`/api/group/${workspaceId}/challenges/${eventId}`).then(res => ({
      ...res,
      data: unwrapData(res),
    })),
  register: (workspaceId: number, eventId: number) =>
    api.post(`/api/group/${workspaceId}/challenges/${eventId}/register`),
  acceptInvitation: (workspaceId: number, eventId: number) =>
    api.post(`/api/group/${workspaceId}/challenges/${eventId}/accept-invite`),
  startAttempt: (workspaceId: number, eventId: number) =>
    api
      .post(`/api/group/${workspaceId}/challenges/${eventId}/start-attempt`)
      .then(res => ({
        ...res,
        data: unwrapData(res),
      })),
  leaderboard: (workspaceId: number, eventId: number) =>
    api.get(`/api/group/${workspaceId}/challenges/${eventId}/leaderboard`).then(res => ({
      ...res,
      data: normalizeList(unwrapData(res)),
    })),
};

export default ChallengeAPI;
