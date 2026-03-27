import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_URL} from '@env';
import api from './api';

const TOKEN_KEY = '@quizmate_token';

const mapQuiz = (item: any) => ({
  ...item,
  id: item?.quizId ?? item?.id,
  name: item?.title ?? item?.name,
  questionCount: item?.totalQuestion ?? item?.questionCount ?? 0,
});

const getQuizList = (payload: any) => {
  if (Array.isArray(payload?.data?.content)) {
    return payload.data.content;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.content)) {
    return payload.content;
  }
  return [];
};

const mapQuizFull = (raw: any) => ({
  // BE may return duration in seconds (new flow) or legacy minute-based value multiplied by 60.
  // Keep a single normalized source for all quiz screens.
  ...(function () {
    const rawDuration = Number(raw?.duration) || 0;
    const normalizedSeconds =
      rawDuration >= 36000 ? Math.floor(rawDuration / 60) : rawDuration;
    const safeSeconds = Math.max(0, normalizedSeconds || 0);
    const minutes = Math.max(1, Math.round(safeSeconds / 60));
    return {
      timeLimitSeconds: safeSeconds,
      timeLimitMinutes: minutes,
    };
  })(),
  ...raw,
  id: raw?.quizId,
  name: raw?.title,
  title: raw?.title,
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
      data: getQuizList(res.data).map(mapQuiz),
    })),
  getByContext: (contextType: string, contextId: number) =>
    (() => {
      const normalized = String(contextType || '').toUpperCase();
      let path: string | null = null;

      if (normalized === 'WORKSPACE') {
        path = `/api/quiz/getByWorkspace/${contextId}`;
      } else if (normalized === 'ROADMAP') {
        path = `/api/quiz/getByRoadmap/${contextId}`;
      } else if (normalized === 'PHASE') {
        path = `/api/quiz/getByPhase/${contextId}`;
      } else if (normalized === 'KNOWLEDGE') {
        path = `/api/quiz/getByKnowledge/${contextId}`;
      }

      if (!path) {
        return Promise.resolve({data: []} as any);
      }

      return api.get(path).catch(() => ({data: []} as any));
    })().then(res => ({
      ...res,
      data: getQuizList(res.data).map(mapQuiz),
    })),
  getByScope: (contextType: 'WORKSPACE' | 'ROADMAP' | 'PHASE' | 'KNOWLEDGE', scopeId: number) => {
    let path = '';
    if (contextType === 'WORKSPACE') {
      path = `/api/quiz/getByWorkspace/${scopeId}`;
    } else if (contextType === 'ROADMAP') {
      path = `/api/quiz/getByRoadmap/${scopeId}`;
    } else if (contextType === 'PHASE') {
      path = `/api/quiz/getByPhase/${scopeId}`;
    } else {
      path = `/api/quiz/getByKnowledge/${scopeId}`;
    }

    return api.get(path).then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapQuiz),
    }));
  },
  getFull: (quizId: number) =>
    api.get(`/api/quiz/${quizId}/full`).then(res => ({
      ...res,
      data: mapQuizFull(res.data?.data),
    })),
  create: (data: any) => api.post('/api/quiz/create', data),
  update: (quizId: number, data: any) => api.put(`/api/quiz/${quizId}`, data),
  toggleStatus: (quizId: number) =>
    api.patch(`/api/quiz/${quizId}/toggle-status`),
  delete: (quizId: number) => api.delete(`/api/quiz/${quizId}`),
  startAttempt: (
    quizId: number,
    options?: {isCompanionMode?: boolean; isPracticeMode?: boolean},
  ) =>
    api
      .post(`/api/quiz-attempts/start/${quizId}`, null, {
        params: {
          isCompanionMode: Boolean(options?.isCompanionMode),
          isPracticeMode: Boolean(options?.isPracticeMode),
        },
      })
      .then(res => ({
      ...res,
      data: {
        ...res.data?.data,
        id: res.data?.data?.attemptId,
      },
    })),
  saveAnswer: (
    attemptId: number,
    data: {
      questionId: number;
      answerId?: number | null;
      selectedAnswerIds?: number[];
      textAnswer?: string | null;
    },
  ) =>
    api.put(`/api/quiz-attempts/${attemptId}/saveAnswer`, [
      {
        questionId: data.questionId,
        selectedAnswerIds:
          Array.isArray(data.selectedAnswerIds)
            ? data.selectedAnswerIds
            : typeof data.answerId === 'number'
            ? [data.answerId]
            : [],
        textAnswer:
          typeof data.textAnswer === 'string' ? data.textAnswer : null,
      },
    ]),
  submitPracticeQuestion: (
    attemptId: number,
    data: {
      questionId: number;
      selectedAnswerIds?: number[];
      textAnswer?: string | null;
    },
  ) =>
    api
      .post(`/api/quiz-attempts/${attemptId}/practice/submit-question`, {
        questionId: data.questionId,
        selectedAnswerIds: Array.isArray(data.selectedAnswerIds)
          ? data.selectedAnswerIds
          : [],
        textAnswer:
          typeof data.textAnswer === 'string' ? data.textAnswer : null,
      })
      .then(res => ({
        ...res,
        data: res.data?.data,
      })),
  submitCompanionVoiceAnswer: (
    attemptId: number,
    data: {
      questionId: number;
      audioFile: {
        uri: string;
        name: string;
        type: string;
      };
    },
  ) => {
    const formData = new FormData();
    formData.append('questionId', String(data.questionId));
    formData.append('audioFile', data.audioFile as any);

    return api
      .post(`/api/quiz-attempts/${attemptId}/companion-answer`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      .then(res => ({
        ...res,
        data: res.data?.data,
      }));
  },
  createCompanionSpeech: (text: string) =>
    api.post('/api/quiz-attempts/companion-speech', {text}).then(res => ({
      ...res,
      data: res.data?.data,
    })),
  getCompanionSpeechPlaybackSource: async (speechId: string) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const baseUrl = String(API_URL || '').replace(/\/+$/, '');

    return {
      url: `${baseUrl}/api/quiz-attempts/companion-speech/${speechId}`,
      headers: token ? {Authorization: `Bearer ${token}`} : {},
    };
  },
  submitAttempt: (attemptId: number) =>
    api.post(`/api/quiz-attempts/${attemptId}/submit`),
  getResult: (attemptId: number) =>
    api.get(`/api/quiz-attempts/${attemptId}/result`).then(res => {
      const raw = res.data?.data || {};
      const maxScore = raw.maxScore || 0;
      const score = raw.score || 0;
      const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : score;
      const rawAccuracy = Number(raw.accuracy);
      const accuracyPercent = Number.isFinite(rawAccuracy)
        ? Math.round(rawAccuracy <= 1 ? rawAccuracy * 100 : rawAccuracy)
        : 0;
      const displayPercent = scorePercent === 0 ? accuracyPercent : scorePercent;
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
          accuracyPercent,
          displayPercent,
          totalQuestions: raw.totalQuestion || 0,
          correctCount: raw.correctQuestion || 0,
          timeTakenSeconds,
          questions: (raw.questions || []).map((q: any, i: number) => ({
            ...q,
            id: q.questionId || i,
            content: q.content || `Question ${i + 1}`,
            answers: q.answers || [],
            questionType: q.questionType,
            textAnswer: q.textAnswer,
            selectedAnswerIds: Array.isArray(q.selectedAnswerIds)
              ? q.selectedAnswerIds
              : [],
            selectedAnswerId: q.selectedAnswerIds?.[0],
          })),
        },
      };
    }),
};

export default QuizAPI;
