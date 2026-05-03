import api from './api';
import {normalizeCurrentPlan} from '../utils/accountSummary';

const DEFAULT_WORKSPACE_NAME = 'Không gian học tập chưa có tiêu đề';
const PLACEHOLDER_WORKSPACE_NAME_PATTERN =
  /^(group\s+)?name\s+null(?:\s*\(\d+\))?$/i;

const normalizeWorkspaceText = (value: any): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim();
  if (
    !normalized ||
    normalized.toLowerCase() === 'null' ||
    normalized.toLowerCase() === 'undefined' ||
    PLACEHOLDER_WORKSPACE_NAME_PATTERN.test(normalized)
  ) {
    return undefined;
  }

  return normalized;
};

const getWorkspaceDisplayName = (item: any): string =>
  normalizeWorkspaceText(item?.displayTitle) ||
  normalizeWorkspaceText(item?.title) ||
  normalizeWorkspaceText(item?.name) ||
  DEFAULT_WORKSPACE_NAME;

const mapWorkspace = (item: any) => ({
  ...item,
  id: item?.workspaceId ?? item?.id,
  workspaceKind: item?.workspaceKind || item?.type || null,
  isGroupWorkspace:
    item?.workspaceKind === 'GROUP' ||
    item?.type === 'GROUP' ||
    item?.isGroupWorkspace === true,
  rawName: normalizeWorkspaceText(item?.name) || '',
  rawTitle: normalizeWorkspaceText(item?.title) || '',
  displayName: getWorkspaceDisplayName(item),
  name: getWorkspaceDisplayName(item),
  title: getWorkspaceDisplayName(item),
});

const buildWorkspacePageMeta = (pageData: any, page: number, size: number) => ({
  page: pageData?.page ?? page,
  size: pageData?.size ?? size,
  totalPages: pageData?.totalPages ?? 0,
  totalElements: pageData?.totalElements ?? 0,
  first: pageData?.first ?? page === 0,
  last: pageData?.last ?? true,
});

const WorkspaceAPI = {
  getByUser: (page = 0, size = 10, search?: string) => {
    const params = new URLSearchParams({
      page: String(page),
      size: String(size),
    });

    if (search?.trim()) {
      params.append('search', search.trim());
    }

    return api.get(`/api/workspace/getByUser?${params.toString()}`).then(res => {
      const pageData = res.data?.data;

      return {
        ...res,
        data: (pageData?.content || []).map(mapWorkspace),
        pagination: buildWorkspacePageMeta(pageData, page, size),
      };
    });
  },
  getById: (id: number) =>
    api.get(`/api/workspace/${id}`).then(res => ({
      ...res,
      data: mapWorkspace(res.data?.data),
    })),
  getCurrentPlan: (workspaceId: number) =>
    api.get(`/api/workspace/${workspaceId}/current-plan`).then(res => ({
      ...res,
      data: normalizeCurrentPlan(res.data?.data),
    })),
  create: (data: {name: string; description?: string}) =>
    api.post('/api/workspace/create/individual', {
      name: data.name,
      description: data.description,
    }),
  update: (id: number, data: {name?: string; description?: string}) =>
    api.put(`/api/workspace/${id}`, {
      name: data.name,
      description: data.description,
    }),
  getQuestionStats: (workspaceId: number, attemptMode = 'OFFICIAL') =>
    api.get(`/api/workspace/${workspaceId}/question-stats`, {
      params: {attemptMode},
    }),
  getQuizStats: (workspaceId: number, attemptMode = 'OFFICIAL') =>
    api.get(`/api/workspace/${workspaceId}/quiz-stats`, {
      params: {attemptMode},
    }),
  delete: (id: number) => api.delete(`/api/workspace/individual/${id}`),
};

export default WorkspaceAPI;
