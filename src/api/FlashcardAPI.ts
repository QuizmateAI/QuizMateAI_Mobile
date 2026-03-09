import api from './api';

const FlashcardAPI = {
  getByContext: (contextType: string, contextId: number) =>
    api.get(`/flashcard?contextType=${contextType}&contextId=${contextId}`),
  getByUser: () => api.get('/flashcard'),
  getById: (id: number) => api.get(`/flashcard/${id}`),
  create: (data: any) => api.post('/flashcard', data),
  updateItem: (id: number, data: any) => api.put(`/flashcard/${id}`, data),
  deleteItem: (id: number) => api.delete(`/flashcard/${id}`),
};

export default FlashcardAPI;
