import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_URL} from '@env';
import api from './api';

const TOKEN_KEY = '@quizmate_token';

function buildAbsoluteUrl(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  const baseUrl = String(API_URL || '').replace(/\/+$/, '');
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${baseUrl}${path}`;
}

function normalizeApiUrl(url?: string) {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  if (/\/api\/v1$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/api$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }

  return `${trimmed}/api/v1`;
}

function buildCompanionSpeechPlaybackUrl(speechId: string) {
  const apiBaseUrl = normalizeApiUrl(API_URL);
  const path = `/quiz-attempts/companion-speech/${encodeURIComponent(speechId)}`;
  return apiBaseUrl ? `${apiBaseUrl}${path}` : buildAbsoluteUrl(`/api/v1${path}`);
}

const mapQuiz = (item: any) => ({
  ...item,
  id: item?.quizId ?? item?.id,
  name: item?.title ?? item?.name,
  questionCount: item?.totalQuestion ?? item?.questionCount ?? 0,
});

const getQuizList = (payload: any) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.data?.content)) {
    return payload.data.content;
  }
  if (Array.isArray(payload?.data?.data)) {
    return payload.data.data;
  }
  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.content)) {
    return payload.content;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
};

const mapAttemptHistory = (item: any) => ({
  ...item,
  id: item?.attemptId ?? item?.id,
  attemptId: item?.attemptId ?? item?.id,
});

const ROADMAP_SCOPED_CONTEXTS = new Set(['ROADMAP', 'PHASE', 'KNOWLEDGE']);

const isRoadmapLinkedQuiz = (quiz: any) => {
  const normalizedContext = String(quiz?.contextType || '').toUpperCase();
  if (ROADMAP_SCOPED_CONTEXTS.has(normalizedContext)) {
    return true;
  }
  return (
    Number(quiz?.roadmapId) > 0 ||
    Number(quiz?.phaseId) > 0 ||
    Number(quiz?.knowledgeId) > 0
  );
};

const filterQuizListForContext = (
  list: any[],
  contextType = 'WORKSPACE',
  options?: {includeRoadmapLinkedQuizzes?: boolean; includeMockTest?: boolean},
) => {
  const normalizedContext = String(contextType || '').toUpperCase();
  const isRoadmapScopedList = ROADMAP_SCOPED_CONTEXTS.has(normalizedContext);
  return list.filter(quiz => {
    if (!options?.includeMockTest && String(quiz?.quizIntent || '').toUpperCase() === 'MOCK_TEST') {
      return false;
    }
    if (!isRoadmapScopedList && !options?.includeRoadmapLinkedQuizzes && isRoadmapLinkedQuiz(quiz)) {
      return false;
    }
    return true;
  });
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
    api.get('/quizzes/getByUser').then(res => ({
      ...res,
      data: filterQuizListForContext(getQuizList(res.data), 'WORKSPACE').map(mapQuiz),
    })),
  getByContext: (
    contextType: string,
    contextId: number,
    options?: {
      quizIntent?: string;
      includeRoadmapLinkedQuizzes?: boolean;
      includeMockTest?: boolean;
    },
  ) =>
    (() => {
      const normalized = String(contextType || '').toUpperCase();
      const quizIntent = String(options?.quizIntent || '').trim().toUpperCase();
      let path: string | null = null;

      if (normalized === 'WORKSPACE' || normalized === 'GROUP') {
        path = quizIntent
          ? `/quizzes/getByWorkspace/${contextId}/intent/${quizIntent}`
          : `/quizzes/getByWorkspace/${contextId}`;
      } else if (normalized === 'ROADMAP') {
        path = `/quizzes/getByRoadmap/${contextId}`;
      } else if (normalized === 'PHASE') {
        path = `/quizzes/getByPhase/${contextId}`;
      } else if (normalized === 'KNOWLEDGE') {
        path = `/quizzes/getByKnowledge/${contextId}`;
      }

      if (!path) {
        return Promise.resolve({data: []} as any);
      }

      return api.get(path).catch(() => ({data: []} as any));
    })().then(res => ({
      ...res,
      data: filterQuizListForContext(getQuizList(res.data), contextType, options).map(mapQuiz),
    })),
  getByScope: (
    contextType: 'WORKSPACE' | 'GROUP' | 'ROADMAP' | 'PHASE' | 'KNOWLEDGE',
    scopeId: number,
    options?: {
      quizIntent?: string;
      includeRoadmapLinkedQuizzes?: boolean;
      includeMockTest?: boolean;
    },
  ) => {
    let path = '';
    const normalized = String(contextType || '').toUpperCase();
    const quizIntent = String(options?.quizIntent || '').trim().toUpperCase();

    if (normalized === 'WORKSPACE' || normalized === 'GROUP') {
      path = quizIntent
        ? `/quizzes/getByWorkspace/${scopeId}/intent/${quizIntent}`
        : `/quizzes/getByWorkspace/${scopeId}`;
    } else if (normalized === 'ROADMAP') {
      path = `/quizzes/getByRoadmap/${scopeId}`;
    } else if (normalized === 'PHASE') {
      path = `/quizzes/getByPhase/${scopeId}`;
    } else {
      path = `/quizzes/getByKnowledge/${scopeId}`;
    }

    return api.get(path).then(res => ({
      ...res,
      data: filterQuizListForContext(getQuizList(res.data), contextType, options).map(mapQuiz),
    }));
  },
  getFull: (quizId: number, options?: {attemptId?: number; attemptView?: boolean}) => {
    const params: Record<string, any> = {};
    if (options?.attemptId != null) {
      params.attemptId = options.attemptId;
    }
    if (options?.attemptView) {
      params.attemptView = true;
    }
    const hasParams = Object.keys(params).length > 0;
    return api
      .get(`/quizzes/${quizId}/full`, hasParams ? {params} : undefined)
      .then(res => ({
        ...res,
        data: mapQuizFull(res.data?.data ?? res.data),
      }));
  },
  updateShuffleEnabled: (quizId: number, enabled: boolean) =>
    api.patch(`/quizzes/${quizId}/shuffle`, {enabled}).then(res => ({
      ...res,
      data: res.data?.data ?? res.data,
    })),
  getAttemptHistory: (quizId: number) =>
    api
      .get('/quiz-attempts/history', {
        params: {quizId},
      })
      .then(res => ({
        ...res,
        data: getQuizList(res.data).map(mapAttemptHistory),
      })),
  getGroupAttemptHistory: (workspaceId: number, quizId: number) =>
    api
      .get(`/groups/${workspaceId}/quiz-attempts/history`, {
        params: {quizId},
      })
      .then(res => ({
        ...res,
        data: getQuizList(res.data).map(mapAttemptHistory),
      })),
  create: (data: any) => api.post('/quizzes', data),
  update: (quizId: number, data: any) => api.put(`/quizzes/${quizId}`, data),
  shareToCommunity: (quizId: number, shared = true) =>
    api.post(`/quizzes/${quizId}/community-share?shared=${shared}`),
  toggleStatus: (quizId: number) =>
    api.patch(`/quizzes/${quizId}/toggle-status`),
  delete: (quizId: number) => api.delete(`/quizzes/${quizId}`),
  startAttempt: (
    quizId: number,
    options?: {isCompanionMode?: boolean; isPracticeMode?: boolean},
  ) =>
    api
      .post(`/quiz-attempts/start/${quizId}`, null, {
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
      matchingPairs?: Array<{leftKey: string; rightKey: string}> | null;
    },
  ) =>
    api.put(`/quiz-attempts/${attemptId}/saveAnswer`, [
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
        matchingPairs: Array.isArray(data.matchingPairs)
          ? data.matchingPairs
          : null,
      },
    ]),
  submitPracticeQuestion: (
    attemptId: number,
    data: {
      questionId: number;
      selectedAnswerIds?: number[];
      textAnswer?: string | null;
      matchingPairs?: Array<{leftKey: string; rightKey: string}> | null;
    },
  ) =>
    api
      .post(`/quiz-attempts/${attemptId}/practice/submit-question`, {
        questionId: data.questionId,
        selectedAnswerIds: Array.isArray(data.selectedAnswerIds)
          ? data.selectedAnswerIds
          : [],
        textAnswer:
          typeof data.textAnswer === 'string' ? data.textAnswer : null,
        matchingPairs: Array.isArray(data.matchingPairs)
          ? data.matchingPairs
          : null,
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
      .post(`/quiz-attempts/${attemptId}/companion-answer`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      .then(res => ({
        ...res,
        data: res.data?.data,
      }));
  },
  createCompanionSpeech: (text: string, attemptId?: number | null) =>
    api
      .post('/quiz-attempts/companion-speech', {
        text,
        attemptId: attemptId ?? undefined,
      })
      .then(res => ({
      ...res,
      data: res.data?.data,
    })),
  getCompanionSpeechPlaybackSource: async (speechId: string, _audioUrl?: string | null) => {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const playbackUrl = buildCompanionSpeechPlaybackUrl(speechId);

    return {
      url: playbackUrl,
      headers: token ? {Authorization: `Bearer ${token}`} : {},
    };
  },
  submitAttempt: (attemptId: number) =>
    api.post(`/quiz-attempts/${attemptId}/submit`),
  createManualQuizBulk: (data: any) =>
    api.post('/quizzes/manual:create-bulk', data),
  getWorkspaceQuestionsCatalog: (
    workspaceId: number,
    params?: {
      excludeQuizId?: number;
      quizId?: number;
      search?: string;
      questionType?: string;
      difficulty?: string;
    },
  ) =>
    api
      .get(`/quizzes/workspace/${workspaceId}/questions-catalog`, {params})
      .then(res => ({
        ...res,
        data: getQuizList(res.data),
      })),
  getAttemptAssessment: (attemptId: number) =>
    api.get(`/quiz-attempts/${attemptId}/assessment`).then(res => ({
      ...res,
      data: res.data?.data,
    })),
  refreshAttemptAssessment: (attemptId: number) =>
    api.post(`/quiz-attempts/${attemptId}/assessment/refresh`).then(res => ({
      ...res,
      data: res.data?.data,
    })),
  getAttemptAssessmentWarning: (attemptId: number) =>
    api.get(`/quiz-attempts/${attemptId}/assessment-warning`).then(res => ({
      ...res,
      data: res.data?.data,
    })),
  getVoiceEligibility: (quizId: number) =>
    api.get(`/quizzes/${quizId}/voice-eligibility`).then(res => ({
      ...res,
      data: res.data?.data,
    })),
  getResult: (attemptId: number) =>
    api.get(`/quiz-attempts/${attemptId}/result`).then(res => {
      const raw = res.data?.data || {};
      const maxScore = raw.maxScore || 0;
      const score = raw.score || 0;
      const scorePercent = maxScore > 0 ? Math.round((score / maxScore) * 100) : score;
      const rawAccuracy = Number(raw.accuracy);
      const rawAccuracyPercent = Number(raw.accuracyPercent);
      const accuracyPercent = Number.isFinite(rawAccuracyPercent)
        ? Math.round(rawAccuracyPercent)
        : Number.isFinite(rawAccuracy)
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
            matchingPairs: Array.isArray(q.matchingPairs)
              ? q.matchingPairs
              : [],
            correctMatchingPairs: Array.isArray(q.correctMatchingPairs)
              ? q.correctMatchingPairs
              : [],
          })),
        },
      };
    }),
};

export default QuizAPI;
