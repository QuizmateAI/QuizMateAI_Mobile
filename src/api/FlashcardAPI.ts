import api from './api';

const mapFlashcard = (item: any) => ({
  ...item,
  id: item?.flashcardSetId ?? item?.id,
  name: item?.flashcardSetName ?? item?.name,
  title: item?.flashcardSetName ?? item?.title,
});

const FlashcardAPI = {
  getByContext: (contextType: string, contextId: number) =>
    (() => {
      let path = '';
      if (contextType === 'WORKSPACE' || contextType === 'GROUP') {
        path = `/flashcards/getByWorkspace/${contextId}`;
      } else if (contextType === 'ROADMAP') {
        path = `/flashcards/getByRoadmap/${contextId}`;
      } else if (contextType === 'PHASE') {
        path = `/flashcards/getByPhase/${contextId}`;
      } else {
        path = `/flashcards/getByKnowledge/${contextId}`;
      }
      return api.get(path);
    })().then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapFlashcard),
    })),
  getByUser: () =>
    api.get('/flashcards/getByUser').then(res => ({
      ...res,
      data: (res.data?.data || []).map(mapFlashcard),
    })),
  getById: (id: number) =>
    api.get(`/flashcards/get/${id}`).then(res => ({
      ...res,
      data: mapFlashcard(res.data?.data),
    })),
  create: (data: any) => api.post('/flashcards/create', data),
  generateAI: (data: any) => api.post('/ai/flashcard:generated', data),
  addItem: (flashcardSetId: number, data: any) => api.post(`/flashcards/${flashcardSetId}/items`, data),
  updateItem: (id: number, data: any) => api.put(`/flashcards/items/${id}`, data),
  deleteItem: (id: number) => api.delete(`/flashcards/items/${id}`),
};

export default FlashcardAPI;
