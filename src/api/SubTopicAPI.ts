import api from './api';

const SubTopicAPI = {
  getByMaterials: (materialIds: number[], workspaceId?: number) => {
    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return Promise.resolve({data: []});
    }

    return api.get('/sub-topics/by-materials', {
      params: {
        materialIds: materialIds.join(','),
        workspaceId,
      },
    });
  },
};

export default SubTopicAPI;