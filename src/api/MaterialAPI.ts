import api from './api';

export const isDeletedMaterial = (material: any) => {
  const status = String(material?.final_status || material?.status || '').trim().toUpperCase();
  return (
    status === 'DELETED' ||
    Boolean(material?.deletedAt) ||
    Boolean(material?.isDeleted)
  );
};

const normalizeMaterials = (payload: any) => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.content)
    ? payload.data.content
    : [];
  return list
    .filter((m: any) => !isDeletedMaterial(m))
    .map((m: any) => ({
    ...m,
    id: m?.materialId ?? m?.id,
    title: m?.title ?? m?.fileName ?? m?.name,
  }));
};

const MaterialAPI = {
  getByWorkspace: (workspaceId: number) =>
    api.get(`/materials/workspace/${workspaceId}`).then(res => ({
      ...res,
      data: normalizeMaterials(res.data),
    })),
  getPendingGroupMaterials: (workspaceId: number) =>
    api.get(`/materials/workspace/${workspaceId}/pending-review`).then(res => ({
      ...res,
      data: normalizeMaterials(res.data),
    })),
  getExtractedText: (materialId: number) =>
    api.get(`/materials/${materialId}/extracted-text`).then(res => ({
      ...res,
      data: res.data?.data || res.data || '',
    })),
  getExtractedSummary: (materialId: number) =>
    api.get(`/materials/${materialId}/extracted-summary`).then(res => ({
      ...res,
      data: res.data?.data || res.data || '',
    })),
  getRAGChunks: (materialId: number, limit = 500) =>
    api.get(`/materials/${materialId}/rag-chunks`, {
      params: {limit},
    }).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  getChunkById: (chunkId: string) =>
    api.get(`/materials/chunks/${encodeURIComponent(chunkId)}`).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  getDocumentSections: (materialId: number) =>
    api.get(`/materials/${materialId}/document-sections`).then(res => ({
      ...res,
      data: Array.isArray(res.data) ? res.data : res.data?.data || [],
    })),
  setDocumentSectionActive: (
    materialId: number,
    sectionId: string,
    isActive: boolean,
  ) =>
    api
      .put(`/materials/${materialId}/document-sections/${sectionId}/active`, null, {
        params: {isActive},
      })
      .then(res => ({
        ...res,
        data: Array.isArray(res.data) ? res.data : res.data?.data || [],
      })),
  getModerationReportDetail: (materialId: number) =>
    api.get(`/materials/${materialId}/moderation-report/detail`).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  reviewMaterial: (materialId: number, isApproved: boolean) =>
    api.post(`/materials/${materialId}/review`, null, {
      params: {isApproved},
      timeout: 60000,
    }).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  reviewGroupMaterial: (materialId: number, isApproved: boolean) =>
    api.post(`/materials/${materialId}/group-review`, null, {
      params: {isApproved},
      timeout: 60000,
    }).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  upload: (formData: FormData) =>
    api.post('/materials/upload', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
  uploadGroupPending: (formData: FormData) =>
    api.post('/materials/upload/group-pending', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
  askMaterial: (payload: {
    question: string;
    workspaceId: number;
    materialId?: number | null;
    topK?: number | null;
    maxContextChars?: number | null;
    workspaceProfile?: any;
  }) =>
    api.post('/materials/ask', payload, {
      timeout: 130000,
    }).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
  delete: (id: number, contextType: 'WORKSPACE' | 'GROUP' = 'WORKSPACE') =>
    api.delete(`/materials/${id}?contextType=${contextType}`),
};

export default MaterialAPI;
