import api from './api';

// Aligned with BE (60s) + small buffer, same as FE.
// Some reasoning prompts (field-suggestion / consistency-validation) can take 30-60s.
// A 30s timeout causes false "AI failed" errors while the BE keeps running.
const AI_TIMEOUT = 65000;

type SuggestProfileInput = {
  knowledge?: string;
  domain?: string;
  learningMode?: string;
  currentLevel?: string;
  strongAreas?: string[];
  weakAreas?: string[];
};

const StudyProfileAPI = {
  analyzeKnowledge: (knowledge: string, signal?: AbortSignal) =>
    api.post(
      '/ai/study-profile/knowledge:analyze',
      {knowledge},
      {timeout: AI_TIMEOUT, signal},
    ),

  suggestProfileFields: (data: SuggestProfileInput, signal?: AbortSignal) =>
    api.post(
      '/ai/study-profile/fields:suggest',
      {
        knowledge: data.knowledge,
        domain: data.domain,
        learningMode: data.learningMode,
        currentLevel: data.currentLevel,
        strongAreas: data.strongAreas,
        weakAreas: data.weakAreas,
      },
      {timeout: AI_TIMEOUT, signal},
    ),

  suggestExamTemplates: (
    data: {knowledge?: string; domain?: string},
    signal?: AbortSignal,
  ) =>
    api.post(
      '/ai/study-profile/exam-templates:suggest',
      {
        knowledge: data.knowledge,
        domain: data.domain,
      },
      {timeout: AI_TIMEOUT, signal},
    ),

  validateProfileConsistency: (data: any, signal?: AbortSignal) =>
    api.post('/ai/study-profile/consistency:validate', data, {
      timeout: AI_TIMEOUT,
      signal,
    }),
};

export default StudyProfileAPI;
