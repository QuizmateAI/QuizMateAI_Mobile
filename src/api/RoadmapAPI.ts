import api from './api';

const mapRoadmap = (item: any) => ({
  ...item,
  id: item?.roadmapId ?? item?.id,
  name: item?.title ?? item?.name,
});

const unwrapData = (res: any) => res?.data?.data ?? res?.data;

const getWorkspaceRoadmapId = async (workspaceId: number) => {
  const workspaceRes = await api.get(`/api/workspace/${workspaceId}`);
  const workspace = unwrapData(workspaceRes) || {};
  return {
    response: workspaceRes,
    workspace,
    roadmapId: workspace?.roadmapId ?? workspace?.roadmap_id ?? workspace?.data?.roadmapId,
  };
};

const RoadmapAPI = {
  getForWorkspace: async (workspaceId: number) => {
    try {
      const profileRes = await api.get(`/api/workspace-profile/individual/${workspaceId}`);
      const profile = unwrapData(profileRes) || {};
      const roadmapId = profile?.roadmapId ?? profile?.roadmap_id;

      if (!roadmapId) {
        return {
          ...profileRes,
          data: [],
        };
      }

      // BE currently exposes roadmap structure by roadmapId, not list by workspaceId.
      try {
        const structureRes = await api.get(`/api/roadmaps/${roadmapId}/structure`);
        const structure = unwrapData(structureRes) || {};
        return {
          ...structureRes,
          data: [
            mapRoadmap({
              roadmapId,
              title:
                structure?.title ||
                profile?.roadmapTitle ||
                profile?.title ||
                `Roadmap #${roadmapId}`,
              status: structure?.status || profile?.roadmapStatus,
            }),
          ],
        };
      } catch {
        // Keep graceful fallback if roadmap structure is temporarily unavailable.
      }

      return {
        ...profileRes,
        data: [
          mapRoadmap({
            roadmapId,
            title: profile?.roadmapTitle || profile?.title || `Roadmap #${roadmapId}`,
            status: profile?.roadmapStatus,
          }),
        ],
      };
    } catch {
      return {
        data: [],
        status: 200,
      };
    }
  },
  getForGroup: async (groupId: number) => {
    try {
      const {response, workspace, roadmapId} = await getWorkspaceRoadmapId(groupId);

      if (!roadmapId) {
        return {
          ...response,
          data: [],
        };
      }

      try {
        const structureRes = await api.get(`/api/roadmaps/${roadmapId}/structure`);
        const structure = unwrapData(structureRes) || {};
        return {
          ...structureRes,
          data: [
            mapRoadmap({
              roadmapId,
              title: structure?.title || workspace?.roadmapTitle || `Roadmap #${roadmapId}`,
              status: structure?.status || workspace?.roadmapStatus,
              description: structure?.description,
              stats: structure?.stats,
            }),
          ],
        };
      } catch {
        return {
          ...response,
          data: [
            mapRoadmap({
              roadmapId,
              title: workspace?.roadmapTitle || `Roadmap #${roadmapId}`,
              status: workspace?.roadmapStatus,
            }),
          ],
        };
      }
    } catch {
      return {
        data: [],
        status: 200,
      };
    }
  },
  getById: (id: number) =>
    api.get(`/api/roadmaps/${id}/structure`).then(res => ({
      ...res,
      data: mapRoadmap(unwrapData(res)),
    })),
  getStructure: (roadmapId: number) =>
    api.get(`/api/roadmaps/${roadmapId}/structure`).then(res => ({
      ...res,
      data: unwrapData(res),
    })),
  getCurrentRoadmapKnowledgeProgress: (roadmapId: number) =>
    api.get('/api/roadmap-knowledges/current', {
      params: {
        roadmapId,
      },
    }).then(res => ({
      ...res,
      data: unwrapData(res),
    })),
  create: (data: any) =>
    api.post('/api/ai/roadmap:generated', data),
  createPhase: (roadmapId: number, data: any) =>
    api.post(`/api/roadmap-phases?roadmapId=${roadmapId}`, data),
  deletePhase: (roadmapId: number, phaseId: number) =>
    api.delete(`/api/roadmap-phases/${phaseId}?roadmapId=${roadmapId}`),
};

export default RoadmapAPI;
