import api from './api';

const MaterialAPI = {
  getByWorkspace: (workspaceId: number) =>
    api.get(`/material?workspaceId=${workspaceId}`),
  upload: (formData: FormData) =>
    api.post('/material/upload', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
  delete: (id: number) => api.delete(`/material/${id}`),
};

export default MaterialAPI;
