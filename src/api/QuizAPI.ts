import api from './api';

const QuizAPI = {
  getByUser: () => api.get('/quiz'),
  getByContext: (contextType: string, contextId: number) =>
    api.get(`/quiz?contextType=${contextType}&contextId=${contextId}`),
  getFull: (quizId: number) => api.get(`/quiz/${quizId}/full`),
  create: (data: any) => api.post('/quiz', data),
  update: (quizId: number, data: any) => api.put(`/quiz/${quizId}`, data),
  delete: (quizId: number) => api.delete(`/quiz/${quizId}`),
  startAttempt: (quizId: number) => api.post(`/quiz/${quizId}/attempt`),
  saveAnswer: (attemptId: number, data: {questionId: number; answerId: number}) =>
    api.post(`/quiz/attempt/${attemptId}/answer`, data),
  submitAttempt: (attemptId: number) =>
    api.post(`/quiz/attempt/${attemptId}/submit`),
  getResult: (attemptId: number) => api.get(`/quiz/attempt/${attemptId}/result`),
};

export default QuizAPI;
