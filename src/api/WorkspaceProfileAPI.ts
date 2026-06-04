import api from './api';

type LearningMode = 'STUDY_NEW' | 'REVIEW' | 'MOCK_TEST';
type AdaptationMode = 'STRICT' | 'FLEXIBLE' | 'BALANCED';
type RoadmapSpeedMode = 'SLOW' | 'STANDARD' | 'FAST' | 'MEDIUM';

type RoadmapKnowledgeLoad = 'BASIC' | 'INTERMEDIATE' | 'ADVANCED';

type ProfilePayload = {
  learningMode: LearningMode;
  domain: string;
  knowledge: string;
  currentLevel: string;
  learningGoal: string;
  weakAreas: string[] | string;
  strongAreas: string[] | string;
  examName?: string;
  roadmapEnabled?: boolean;
  knowledgeLoad?: RoadmapKnowledgeLoad;
  adaptationMode?: AdaptationMode;
  speedMode?: RoadmapSpeedMode;
  estimatedTotalDays?: number | null;
  estimatedMinutesPerDay?: number | null;
};

const MOCK_TEST_DEFAULT_QUESTION_TYPE_ID = 1;
const MOCK_TEST_POLL_ATTEMPTS = 30;
const MOCK_TEST_POLL_INTERVAL_MS = 1500;

const trimToNull = (value: any) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeListField = (value: string[] | string | undefined) => {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;/]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
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

const buildBasicStepRequest = (payload: ProfilePayload) => ({
  learningMode: payload.learningMode,
  domain: trimToNull(payload.domain),
  knowledge: trimToNull(payload.knowledge),
  roadmapEnabled:
    payload.learningMode === 'STUDY_NEW'
      ? true
      : Boolean(payload.roadmapEnabled),
});

const buildPersonalInfoStepRequest = (payload: ProfilePayload) => ({
  currentLevel: trimToNull(payload.currentLevel),
  learningGoal: trimToNull(payload.learningGoal),
  weakAreas: normalizeListField(payload.weakAreas),
  strongAreas: normalizeListField(payload.strongAreas),
});

const buildMockTestPersonalInfoRequest = (payload: ProfilePayload) => {
  const examName = trimToNull(payload.examName) || trimToNull(payload.domain) || 'Mock Test';
  return {
    currentLevel: trimToNull(payload.currentLevel),
    learningGoal: trimToNull(payload.learningGoal),
    examName,
    weakAreas: normalizeListField(payload.weakAreas),
    strongAreas: normalizeListField(payload.strongAreas),
    mockTestRequest: {
      title: `${examName} Template`,
      materialIds: [],
      overallDifficulty: 'MEDIUM',
      durationInMinute: 90,
      durationInSecond: 0,
      totalQuestion: 60,
      prompt: null,
      outputLanguage: 'Vietnamese',
      sectionConfigs: [
        {
          name: 'Full Exam',
          description: `Tap trung vao ${examName}.`,
          numQuestions: 60,
          questionTypes: [{questionTypeId: MOCK_TEST_DEFAULT_QUESTION_TYPE_ID}],
        },
      ],
    },
  };
};

const buildRoadmapConfigStepRequest = (payload: ProfilePayload) => {
  const roadmapEnabled =
    payload.learningMode === 'STUDY_NEW'
      ? true
      : Boolean(payload.roadmapEnabled);

  if (!roadmapEnabled) {
    return {
      adaptationMode: null,
      speedMode: null,
      estimatedTotalDays: null,
      estimatedMinutesPerDay: null,
    };
  }

  return {
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
  };
};

const WorkspaceProfileAPI = {
  getProfile: (workspaceId: number) =>
    api.get(`/workspace-profiles/individual/${workspaceId}`),

  saveBasicStep: (workspaceId: number, payload: ProfilePayload) =>
    api.put(
      `/workspace-profiles/individual/${workspaceId}/steps/basic`,
      buildBasicStepRequest(payload),
    ),

  savePersonalInfoStep: (workspaceId: number, payload: ProfilePayload) =>
    api.put(
      `/workspace-profiles/individual/${workspaceId}/steps/personal-info`,
      buildPersonalInfoStepRequest(payload),
    ),

  startMockTestPersonalInfoStep: (workspaceId: number, payload: ProfilePayload) =>
    api.post(
      `/workspace-profiles/individual/${workspaceId}/steps/personal-info/mock-test`,
      buildMockTestPersonalInfoRequest(payload),
    ),

  saveRoadmapConfigStep: (workspaceId: number, payload: ProfilePayload) =>
    api.put(
      `/workspace-profiles/individual/${workspaceId}/steps/roadmap-config`,
      buildRoadmapConfigStepRequest(payload),
    ),

  suggestRoadmapConfig: (workspaceId: number) =>
    api.post(`/workspace-profiles/individual/${workspaceId}/roadmap-config/suggest`),

  confirm: (workspaceId: number) =>
    api.post(`/workspace-profiles/individual/${workspaceId}/steps/confirm`),

  waitForMockTestPersonalInfoDone: async (workspaceId: number) => {
    for (let attempt = 0; attempt < MOCK_TEST_POLL_ATTEMPTS; attempt += 1) {
      const response = await WorkspaceProfileAPI.getProfile(workspaceId);
      const profile = response?.data?.data || response?.data || {};
      const currentStep = Number(profile?.currentStep || 0);
      const setupStatus = String(profile?.workspaceSetupStatus || '').toUpperCase();

      if (currentStep >= 3 || setupStatus === 'PROFILE_DONE' || setupStatus === 'DONE') {
        return response;
      }

      await new Promise(resolve => setTimeout(resolve, MOCK_TEST_POLL_INTERVAL_MS));
    }

    throw new Error('Mock test onboarding step is still processing. Please try again shortly.');
  },

  configureProfileDraft: async (workspaceId: number, payload: ProfilePayload) => {
    await WorkspaceProfileAPI.saveBasicStep(workspaceId, payload);

    if (payload.learningMode === 'MOCK_TEST') {
      await WorkspaceProfileAPI.startMockTestPersonalInfoStep(workspaceId, payload);
      await WorkspaceProfileAPI.waitForMockTestPersonalInfoDone(workspaceId);
    } else {
      await WorkspaceProfileAPI.savePersonalInfoStep(workspaceId, payload);
    }

    return WorkspaceProfileAPI.saveRoadmapConfigStep(workspaceId, payload);
  },
};

export default WorkspaceProfileAPI;
