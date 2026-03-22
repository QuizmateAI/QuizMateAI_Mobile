import api from './api';

const AIAPI = {
  generateMockTest: (data: any) => api.post('/api/ai/mocktest:generated', data),

  generateAIFlashcardSet: (data: any) =>
    api.post('/api/ai/flashcard:generated', data),

  getQuestionTypes: () => api.get('/api/question-types'),

  getDifficultyDefinitions: () => api.get('/api/difficulty-definitions'),

  getBloomSkills: () => api.get('/api/bloom-skill-tests'),

  generateAIQuiz: (data: any) => api.post('/api/ai/quiz:generated', data),

  generateRoadmapPhases: (data: any) =>
    api.post('/api/ai/roadmap-phases:generated', data),

  generateRoadmapPhaseContent: (data: any) =>
    api.post('/api/ai/roadmap-phase-content:generated', data),

  generateRoadmapPreLearning: (data: any) =>
    api.post('/api/ai/roadmap-prelearning:generated', data),

  generateRoadmapKnowledgeQuiz: (data: any) =>
    api.post('/api/ai/knowledge-quiz:generated', data),
};

export default AIAPI;
