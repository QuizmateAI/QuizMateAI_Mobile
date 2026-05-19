import api from './api';

const unwrapList = (payload: any) => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.data?.data)) {
    return payload.data.data;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.content)) {
    return payload.content;
  }
  return [];
};

const unwrapData = (payload: any) => payload?.data?.data ?? payload?.data ?? payload;

const mapCollection = (item: any) => ({
  ...item,
  id: item?.collectionId ?? item?.id,
  name: item?.title ?? item?.name,
  questionCount: item?.totalQuestion ?? item?.questionCount ?? 0,
});

const QuizCollectionAPI = {
  getByWorkspace: (workspaceId: number) =>
    api.get(`/quiz-collections/byWorkspace/${workspaceId}`).then(res => ({
      ...res,
      data: unwrapList(res.data).map(mapCollection),
    })),
  getById: (collectionId: number) =>
    api.get(`/quiz-collections/${collectionId}`).then(res => ({
      ...res,
      data: mapCollection(unwrapData(res.data)),
    })),
  create: (payload: {workspaceId: number; title: string; description?: string}) =>
    api.post('/quiz-collections', payload).then(res => ({
      ...res,
      data: mapCollection(unwrapData(res.data)),
    })),
  update: (
    collectionId: number,
    payload: {title?: string; description?: string; status?: string},
  ) =>
    api.put(`/quiz-collections/${collectionId}`, payload).then(res => ({
      ...res,
      data: mapCollection(unwrapData(res.data)),
    })),
  delete: (collectionId: number) =>
    api.delete(`/quiz-collections/${collectionId}`),
  getQuestions: (collectionId: number) =>
    api.get(`/quiz-collections/${collectionId}/questions`).then(res => ({
      ...res,
      data: unwrapList(res.data),
    })),
  deleteQuestion: (collectionId: number, questionId: number) =>
    api.delete(`/quiz-collections/${collectionId}/questions/${questionId}`),
  importQuizzes: (collectionId: number, sourceQuizIds: number[]) =>
    api
      .post(`/quiz-collections/${collectionId}/quizzes:import`, {
        sourceQuizIds,
      })
      .then(res => ({
        ...res,
        data: mapCollection(unwrapData(res.data)),
      })),
  importQuestions: (collectionId: number, sourceQuestionIds: number[]) =>
    api
      .post(`/quiz-collections/${collectionId}/questions:import`, {
        sourceQuestionIds,
      })
      .then(res => ({
        ...res,
        data: mapCollection(unwrapData(res.data)),
      })),
  getPracticeFull: (collectionId: number) =>
    api.get(`/quiz-collections/${collectionId}/practice/full`).then(res => ({
      ...res,
      data: unwrapData(res.data),
    })),
  startPractice: (
    collectionId: number,
    options?: {isCompanionMode?: boolean; isPracticeMode?: boolean},
  ) =>
    api
      .post(`/quiz-collections/${collectionId}/practice/start`, null, {
        params: {
          isCompanionMode: Boolean(options?.isCompanionMode),
          isPracticeMode: options?.isPracticeMode !== false,
        },
      })
      .then(res => ({
        ...res,
        data: unwrapData(res.data),
      })),
  startRandomPractice: (
    collectionId: number,
    count: number,
    options?: {isCompanionMode?: boolean; isPracticeMode?: boolean},
  ) =>
    api
      .post(`/quiz-collections/${collectionId}/practice/random`, null, {
        params: {
          count,
          isCompanionMode: Boolean(options?.isCompanionMode),
          isPracticeMode: options?.isPracticeMode !== false,
        },
      })
      .then(res => ({
        ...res,
        data: unwrapData(res.data),
      })),
};

export default QuizCollectionAPI;
