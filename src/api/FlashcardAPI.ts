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
        path = `/api/flashcards/getByWorkspace/${contextId}`;
      } else if (contextType === 'ROADMAP') {
        path = `/api/flashcards/getByRoadmap/${contextId}`;
      } else if (contextType === 'PHASE') {
        path = `/api/flashcards/getByPhase/${contextId}`;
      } else {
        path = `/api/flashcards/getByKnowledge/${contextId}`;
      }
      return api.get(path);
    })().then(res => ({
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
  generateAI: (data: any) => api.post('/api/ai/flashcard:generated', data),
  addItem: (flashcardSetId: number, data: any) => api.post(`/api/flashcards/${flashcardSetId}/items`, data),
  updateItem: (id: number, data: any) => api.put(`/api/flashcards/items/${id}`, data),
  deleteItem: (id: number) => api.delete(`/api/flashcards/items/${id}`),
};

export default FlashcardAPI;
