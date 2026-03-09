import api from './api';

const ProfileAPI = {
  getProfile: () => api.get('/user/profile'),

  updateProfile: (data: {fullName?: string; email?: string; birthday?: string}) =>
    api.put('/user/profile', data),

  changePassword: (data: {oldPassword: string; newPassword: string}) =>
    api.put('/user/password', data),

  uploadAvatar: (formData: FormData) =>
    api.post('/user/avatar', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }),
};

export default ProfileAPI;
