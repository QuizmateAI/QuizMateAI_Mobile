import api from './api';

const RoadmapAPI = {
  getForWorkspace: (workspaceId: number) =>
    api.get(`/roadmap?contextType=WORKSPACE&contextId=${workspaceId}`),
  getForGroup: (groupId: number) =>
    api.get(`/roadmap?contextType=GROUP&contextId=${groupId}`),
  getById: (id: number) => api.get(`/roadmap/${id}`),
  create: (data: any) => api.post('/roadmap', data),
  createPhase: (roadmapId: number, data: any) =>
    api.post(`/roadmap/${roadmapId}/phase`, data),
  deletePhase: (roadmapId: number, phaseId: number) =>
    api.delete(`/roadmap/${roadmapId}/phase/${phaseId}`),
};

export default RoadmapAPI;
