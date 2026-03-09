import api from './api';

const mapRoadmap = (item: any) => ({
  ...item,
  id: item?.roadmapId ?? item?.id,
  name: item?.title ?? item?.name,
});

const RoadmapAPI = {
  getForWorkspace: (workspaceId: number) =>
    api.get(`/api/roadmap/workspace/${workspaceId}`).then(res => ({
      ...res,
      data: (res.data?.data?.content || []).map(mapRoadmap),
    })),
  getForGroup: (groupId: number) =>
    api.get(`/api/roadmap/group/${groupId}`).then(res => ({
      ...res,
      data: (res.data?.data?.content || []).map(mapRoadmap),
    })),
  getById: (id: number) =>
    api.get(`/api/roadmap/${id}`).then(res => ({
      ...res,
      data: mapRoadmap(res.data?.data),
    })),
  create: (data: any) =>
    data?.groupId
      ? api.post(`/api/roadmap/create/group/${data.groupId}`, data)
      : api.post(`/api/roadmap/create/workspace/${data.workspaceId}`, data),
  createPhase: (roadmapId: number, data: any) =>
    api.post(`/api/roadmap-phases?roadmapId=${roadmapId}`, data),
  deletePhase: (roadmapId: number, phaseId: number) =>
    api.delete(`/api/roadmap-phases/${phaseId}?roadmapId=${roadmapId}`),
};

export default RoadmapAPI;
