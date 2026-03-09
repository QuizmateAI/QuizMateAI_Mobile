import api from './api';

const mapQuiz = (item: any) => ({
  ...item,
  id: item?.quizId ?? item?.id,
  name: item?.title ?? item?.name,
  questionCount: item?.totalQuestion ?? item?.questionCount ?? 0,
});

const mapQuizFull = (raw: any) => ({
  ...raw,
  id: raw?.quizId,
  name: raw?.title,
  title: raw?.title,
  timeLimitMinutes: raw?.duration,
  sections: (raw?.sections || []).map((s: any) => ({
    ...s,
    id: s?.sectionId,
    name: s?.content || s?.name,
    questions: (s?.questions || []).map((q: any) => ({
      ...q,
      id: q?.questionId,
      answers: (q?.answers || []).map((a: any) => ({
        ...a,
        id: a?.answerId,
      })),
    })),
  })),
});

const QuizAPI = {
  getByUser: () =>
    api.get('/api/quiz/getByUser').then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapQuiz),
    })),
  getByContext: (contextType: string, contextId: number) =>
    api.get(`/api/quiz/getByContext/${contextType}/${contextId}`).then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapQuiz),
    })),
  getFull: (quizId: number) =>
    api.get(`/api/quiz/${quizId}/full`).then(res => ({
      ...res,
      data: mapQuizFull(res.data?.data),
    })),
  create: (data: any) => api.post('/api/quiz/create', data),
  update: (quizId: number, data: any) => api.put(`/api/quiz/${quizId}`, data),
  delete: (quizId: number) => api.delete(`/api/quiz/${quizId}`),
  startAttempt: (quizId: number) =>
    api.post(`/api/quiz-attempts/start/${quizId}`).then(res => ({
      ...res,
      data: {
        ...res.data?.data,
        id: res.data?.data?.attemptId,
      },
    })),
  saveAnswer: (attemptId: number, data: {questionId: number; answerId: number}) =>
    api.put(`/api/quiz-attempts/${attemptId}/saveAnswer`, [
      {
        questionId: data.questionId,
        selectedAnswerIds: [data.answerId],
      },
    ]),
  submitAttempt: (attemptId: number) =>
    api.post(`/api/quiz-attempts/${attemptId}/submit`),
  getResult: (attemptId: number) =>
    api.get(`/api/quiz-attempts/${attemptId}/result`).then(res => {
      const raw = res.data?.data || {};
      const maxScore = raw.maxScore || 0;
      const score = raw.score || 0;
      const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : score;
      const startedAt = raw.startedAt ? new Date(raw.startedAt).getTime() : 0;
      const completedAt = raw.completedAt ? new Date(raw.completedAt).getTime() : 0;
      const timeTakenSeconds =
        startedAt && completedAt && completedAt > startedAt
          ? Math.floor((completedAt - startedAt) / 1000)
          : undefined;
      return {
        ...res,
        data: {
          ...raw,
          score: scorePercent,
          totalQuestions: raw.totalQuestion || 0,
          correctCount: raw.correctQuestion || 0,
          timeTakenSeconds,
          questions: (raw.questions || []).map((q: any, i: number) => ({
            ...q,
            id: q.questionId || i,
            content: q.content || `Question ${i + 1}`,
            answers: q.answers || [],
            selectedAnswerId: q.selectedAnswerIds?.[0],
          })),
        },
      };
    }),
};

export default QuizAPI;
