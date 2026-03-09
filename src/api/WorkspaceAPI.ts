import api from './api';

const WorkspaceAPI = {
  getByUser: () => api.get('/workspace'),
  getById: (id: number) => api.get(`/workspace/${id}`),
  create: (data: {name: string; description?: string}) =>
    api.post('/workspace', data),
  update: (id: number, data: {name?: string; description?: string}) =>
    api.put(`/workspace/${id}`, data),
  delete: (id: number) => api.delete(`/workspace/${id}`),
};

export default WorkspaceAPI;
