import api from './api';

const MaterialNoteAPI = {
  list: (materialId: number, type?: 'NORMAL' | 'HIGHLIGHT') =>
    api
      .get(`/material-notes/material/${materialId}`, {
        params: type ? {type} : undefined,
      })
      .then(res => ({
        ...res,
        data: Array.isArray(res.data) ? res.data : res.data?.data || [],
      })),

  create: (payload: {
    materialId: number;
    noteType?: 'NORMAL' | 'HIGHLIGHT';
    title?: string;
    content?: string;
    highlightedText?: string;
    startOffset?: number | null;
    endOffset?: number | null;
    pageNumber?: number | null;
    topRatio?: number | null;
    selectionRects?: Array<{
      leftRatio: number;
      topRatio: number;
      widthRatio: number;
      heightRatio: number;
    }>;
  }) =>
    api.post('/material-notes', payload).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),

  update: (
    noteId: number,
    payload: {
      title?: string;
      content?: string;
      noteType?: 'NORMAL' | 'HIGHLIGHT';
      highlightedText?: string;
      startOffset?: number | null;
      endOffset?: number | null;
      pageNumber?: number | null;
      topRatio?: number | null;
      selectionRects?: Array<{
        leftRatio: number;
        topRatio: number;
        widthRatio: number;
        heightRatio: number;
      }>;
    },
  ) =>
    api.put(`/material-notes/${noteId}`, payload).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),

  delete: (noteId: number) =>
    api.delete(`/material-notes/${noteId}`).then(res => ({
      ...res,
      data: res.data?.data || res.data || null,
    })),
};

export default MaterialNoteAPI;
