import api from './api';

const MaterialAPI = {
  getByWorkspace: (workspaceId: number) =>
    api.get(`/api/materials/workspace/${workspaceId}`),
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
  delete: (id: number, contextType: 'WORKSPACE' | 'GROUP' = 'WORKSPACE') =>
    api.delete(`/api/materials/${id}?contextType=${contextType}`),
};

export default MaterialAPI;
