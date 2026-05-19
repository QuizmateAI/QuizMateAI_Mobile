import api from './api';

const unwrapData = (res: any) => res?.data?.data ?? res?.data ?? null;

function normalizeMessages(payload: any) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.messages)) {
    return payload.messages;
  }
  if (Array.isArray(payload?.content)) {
    return payload.content;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  return [];
}

function discussionPath(workspaceId: number, quizId: number, suffix = '') {
  return `/groups/${workspaceId}/quizzes/${quizId}/discussion${suffix}`;
}

const GroupDiscussionAPI = {
  getMessages: (workspaceId: number, quizId: number, questionId?: number | null) =>
    api
      .get(discussionPath(workspaceId, quizId), {
        params: questionId ? {questionId} : undefined,
      })
      .then(res => ({
        ...res,
        data: normalizeMessages(unwrapData(res)),
      })),
  postMessage: (
    workspaceId: number,
    quizId: number,
    payload: {
      body: string;
      questionId?: number | null;
      parentMessageId?: number | string | null;
    },
  ) =>
    api
      .post(discussionPath(workspaceId, quizId), {
        body: String(payload.body || ''),
        questionId: payload.questionId ?? null,
        parentMessageId: payload.parentMessageId ?? null,
      })
      .then(res => ({
        ...res,
        data: unwrapData(res),
      })),
  deleteMessage: (workspaceId: number, quizId: number, messageId: number | string) =>
    api.delete(discussionPath(workspaceId, quizId, `/${encodeURIComponent(String(messageId))}`)),
  getCounts: (workspaceId: number, quizId: number, questionIds: Array<number | string> = []) =>
    api
      .get(discussionPath(workspaceId, quizId, '/counts'), {
        params:
          questionIds.length > 0
            ? {questionIds: questionIds.map(String).join(',')}
            : undefined,
      })
      .then(res => ({
        ...res,
        data: unwrapData(res) || {quiz: 0, questions: {}},
      })),
};

export default GroupDiscussionAPI;
