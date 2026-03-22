import api from './api';

const mapWorkspace = (item: any) => ({
  ...item,
  id: item?.workspaceId ?? item?.id,
  name: item?.displayTitle || item?.title || item?.name,
  title: item?.displayTitle || item?.title || item?.name,
});

const WorkspaceAPI = {
  getByUser: () =>
    api.get('/api/workspace/getByUser').then(res => ({
      ...res,
      data: (res.data?.data?.content || []).map(mapWorkspace),
    })),
  getById: (id: number) =>
    api.get(`/api/workspace/${id}`).then(res => ({
      ...res,
      data: mapWorkspace(res.data?.data),
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
  delete: (id: number) => api.delete(`/api/workspace/individual/${id}`),
};

export default WorkspaceAPI;
