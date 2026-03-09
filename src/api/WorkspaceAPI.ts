import api from './api';

const mapWorkspace = (item: any) => ({
  ...item,
  id: item?.workspaceId ?? item?.id,
  name: item?.displayTitle || item?.title || item?.name,
  title: item?.displayTitle || item?.title || item?.name,
});

const WorkspaceAPI = {
  getByUser: () =>
    api.get('/api/workSpace/getByUser').then(res => ({
      ...res,
      data: (res.data?.data?.content || []).map(mapWorkspace),
    })),
  getById: (id: number) =>
    api.get(`/api/workSpace/${id}`).then(res => ({
      ...res,
      data: mapWorkspace(res.data?.data),
    })),
  create: (data: {name: string; description?: string}) =>
    api.post('/api/workSpace/create', {
      title: data.name,
      description: data.description,
    }),
  update: (id: number, data: {name?: string; description?: string}) =>
    api.put(`/api/workSpace/${id}`, {
      title: data.name,
      description: data.description,
    }),
  delete: (id: number) => api.delete(`/api/workSpace/${id}`),
};

export default WorkspaceAPI;
