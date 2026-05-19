import api from './api';

const AIAPI = {
  generateMockTest: (data: any) => api.post('/ai/mocktest:generated', data),

  generateAIFlashcardSet: (data: any) =>
    api.post('/ai/flashcard:generated', data),

  getQuestionTypes: () => api.get('/question-types'),

  getDifficultyDefinitions: () => api.get('/difficulty-definitions'),

  getBloomSkills: () => api.get('/bloom-skill-tests'),

  generateAIQuiz: (data: any) => api.post('/ai/quiz:generated', data),

  generateRoadmapPhases: (data: any) =>
    api.post('/ai/roadmap-phases:generated', data),

  generateRoadmapPhaseContent: (data: any) =>
    api.post('/ai/roadmap-phase-content:generated', data),

  generateRoadmapPreLearning: (data: any) =>
    api.post('/ai/roadmap-prelearning:generated', data),

  generateRoadmapKnowledgeQuiz: (data: any) =>
    api.post('/ai/knowledge-quiz:generated', data),
};

export default AIAPI;
