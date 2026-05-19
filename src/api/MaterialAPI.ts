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
  delete: (id: number, contextType: 'WORKSPACE' | 'GROUP' = 'WORKSPACE') =>
    api.delete(`/materials/${id}?contextType=${contextType}`),
};

export default MaterialAPI;
