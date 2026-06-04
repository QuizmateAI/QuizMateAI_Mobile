import api from './api';

type LearningMode = 'STUDY_NEW' | 'REVIEW' | 'MOCK_TEST';
type AdaptationMode = 'STRICT' | 'FLEXIBLE' | 'BALANCED';
type RoadmapSpeedMode = 'SLOW' | 'STANDARD' | 'FAST' | 'MEDIUM';
type RoadmapKnowledgeLoad = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

type GroupProfilePayload = {
  groupName?: string;
  rules?: string;
  domain: string;
  knowledge: string;
  learningMode: LearningMode;
  groupLearningGoal: string;
  examName?: string;
  roadmapEnabled?: boolean;
  knowledgeLoad?: RoadmapKnowledgeLoad;
  adaptationMode?: AdaptationMode;
  speedMode?: RoadmapSpeedMode;
  estimatedTotalDays?: number | null;
  estimatedMinutesPerDay?: number | null;
};

const trimToNull = (value: any) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toRoadmapSpeedMode = (value: RoadmapSpeedMode | undefined) => {
  if (value === 'STANDARD' || value === 'MEDIUM') {
    return 'MEDIUM';
  }
  if (value === 'SLOW' || value === 'FAST') {
    return value;
  }
  return null;
};

const buildConfigStepRequest = (payload: GroupProfilePayload) => ({
  domain: payload.domain.trim(),
  knowledge: payload.knowledge.trim(),
  learningMode: payload.learningMode,
  roadmapEnabled: Boolean(payload.roadmapEnabled),
  groupLearningGoal: payload.groupLearningGoal.trim(),
  examName: trimToNull(payload.examName),
});

const buildRoadmapConfigStepRequest = (payload: GroupProfilePayload) => ({
  knowledgeLoad: payload.knowledgeLoad || null,
  adaptationMode: payload.adaptationMode || null,
  speedMode: toRoadmapSpeedMode(payload.speedMode),
  estimatedTotalDays:
    payload.estimatedTotalDays && payload.estimatedTotalDays > 0
      ? payload.estimatedTotalDays
      : null,
  estimatedMinutesPerDay:
    payload.estimatedMinutesPerDay && payload.estimatedMinutesPerDay > 0
      ? payload.estimatedMinutesPerDay
      : null,
});

const GroupWorkspaceProfileAPI = {
  getProfile: (workspaceId: number) =>
    api.get(`/workspace-profiles/group/${workspaceId}`),

  saveBasicStep: (workspaceId: number, payload: {groupName: string; rules?: string}) =>
    api.put(`/workspace-profiles/group/${workspaceId}/steps/basic`, {
      groupName: payload.groupName,
      rules: trimToNull(payload.rules),
    }),

  saveConfigStep: (workspaceId: number, payload: GroupProfilePayload) =>
    api.put(
      `/workspace-profiles/group/${workspaceId}/steps/config`,
      buildConfigStepRequest(payload),
    ),

  updateConfig: (workspaceId: number, payload: GroupProfilePayload) =>
    api.put(
      `/workspace-profiles/group/${workspaceId}/config`,
      buildConfigStepRequest(payload),
    ),

  saveRoadmapConfigStep: (workspaceId: number, payload: GroupProfilePayload) =>
    api.put(
      `/workspace-profiles/group/${workspaceId}/steps/roadmap-config`,
      buildRoadmapConfigStepRequest(payload),
    ),

  confirm: (workspaceId: number) =>
    api.post(`/workspace-profiles/group/${workspaceId}/steps/confirm`),

  configureProfileDraft: async (workspaceId: number, payload: GroupProfilePayload) => {
    await GroupWorkspaceProfileAPI.saveConfigStep(workspaceId, payload);
    return GroupWorkspaceProfileAPI.saveRoadmapConfigStep(workspaceId, payload);
  },
};

export default GroupWorkspaceProfileAPI;
