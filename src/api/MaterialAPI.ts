import api from './api';

const MaterialAPI = {
  getByWorkspace: (workspaceId: number) =>
    api.get(`/api/materials/workspace/${workspaceId}`),
  upload: (formData: FormData) =>
    api.post('/api/materials/upload', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
  delete: (id: number, contextType: 'WORKSPACE' | 'GROUP' = 'WORKSPACE') =>
    api.delete(`/api/materials/${id}?contextType=${contextType}`),
};

export default MaterialAPI;
