import api from './api';

const mapFlashcard = (item: any) => ({
  ...item,
  id: item?.flashcardSetId ?? item?.id,
  name: item?.flashcardSetName ?? item?.name,
  title: item?.flashcardSetName ?? item?.title,
});

const FlashcardAPI = {
  getByContext: (contextType: string, contextId: number) =>
    api.get(`/api/flashcards/getByContext/${contextType}/${contextId}`).then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapFlashcard),
    })),
  getByUser: () =>
    api.get('/api/flashcards/getByUser').then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapFlashcard),
    })),
  getById: (id: number) =>
    api.get(`/api/flashcards/get/${id}`).then(res => ({
      ...res,
      data: mapFlashcard(res.data?.data),
    })),
  create: (data: any) => api.post('/api/flashcards/create', data),
  updateItem: (id: number, data: any) => api.put(`/api/flashcards/items/${id}`, data),
  deleteItem: (id: number) => api.delete(`/api/flashcards/items/${id}`),
};

export default FlashcardAPI;
