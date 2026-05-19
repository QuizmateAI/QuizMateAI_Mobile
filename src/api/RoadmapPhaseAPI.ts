import api from './api';

const unwrapData = (res: any) => res?.data?.data ?? res?.data;

const RoadmapPhaseAPI = {
  getCurrentPhaseProgress: (roadmapId?: number | null) => {
    const normalizedRoadmapId = Number(roadmapId);
    return api
      .get('/roadmap-phases/current', {
        params:
          Number.isInteger(normalizedRoadmapId) && normalizedRoadmapId > 0
            ? {roadmapId: normalizedRoadmapId}
            : undefined,
      })
      .then(res => ({
        ...res,
        data: unwrapData(res),
      }));
  },

  submitSkipDecision: (phaseId: number, skipped: boolean) => {
    const normalizedPhaseId = Number(phaseId);
    return api
      .patch(`/roadmap-phases/${normalizedPhaseId}/skip-decision`, {
        skipped: Boolean(skipped),
      })
      .then(res => ({
        ...res,
        data: unwrapData(res),
      }));
  },

  submitRemedialDecision: (phaseId: number, option: string) => {
    const normalizedPhaseId = Number(phaseId);
    return api
      .post(`/roadmap-phases/${normalizedPhaseId}/remedial-decision`, {
        option: String(option || '').toUpperCase(),
      })
      .then(res => ({
        ...res,
        data: unwrapData(res),
      }));
  },

  createProgressReview: (phaseProgressId: number) => {
    const normalizedPhaseProgressId = Number(phaseProgressId);
    return api
      .post(`/roadmap-phases/progress/${normalizedPhaseProgressId}/review`, null)
      .then(res => ({
        ...res,
        data: unwrapData(res),
      }));
  },

  getPhaseReview: (phaseId: number) => {
    const normalizedPhaseId = Number(phaseId);
    return api.get(`/roadmap-phases/${normalizedPhaseId}/review`).then(res => ({
      ...res,
      data: unwrapData(res),
    }));
  },
};

export default RoadmapPhaseAPI;
