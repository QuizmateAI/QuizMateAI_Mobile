import api from './api';

const normalizeMaterials = (payload: any) => {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.data?.content)
    ? payload.data.content
    : [];
  return list.map((m: any) => ({
    ...m,
    id: m?.materialId ?? m?.id,
    title: m?.title ?? m?.fileName ?? m?.name,
  }));
};

const MaterialAPI = {
  getByWorkspace: (workspaceId: number) =>
    api.get(`/api/materials/workspace/${workspaceId}`).then(res => ({
      ...res,
      data: normalizeMaterials(res.data),
    })),
  getPendingGroupMaterials: (workspaceId: number) =>
    api.get(`/api/materials/workspace/${workspaceId}/pending-review`).then(res => ({
      ...res,
      data: normalizeMaterials(res.data),
    })),
  getExtractedText: (materialId: number) =>
    api.get(`/api/materials/${materialId}/extracted-text`).then(res => ({
      ...res,
      data: res.data?.data || res.data || '',
    })),
  getExtractedSummary: (materialId: number) =>
    api.get(`/api/materials/${materialId}/extracted-summary`).then(res => ({
      ...res,
      data: res.data?.data || res.data || '',
    })),
  upload: (formData: FormData) =>
    api.post('/api/materials/upload', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
  uploadGroupPending: (formData: FormData) =>
    api.post('/api/materials/upload/group-pending', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
  reviewGroupMaterial: (materialId: number, isApproved: boolean) =>
    api.post(`/api/materials/${materialId}/group-review`, null, {
      params: {isApproved},
    }),
  delete: (id: number, contextType: 'WORKSPACE' | 'GROUP' = 'WORKSPACE') =>
    api.delete(`/api/materials/${id}?contextType=${contextType}`),
};

export default MaterialAPI;
