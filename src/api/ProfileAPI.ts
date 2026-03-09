import api from './api';

const ProfileAPI = {
  getProfile: () =>
    api.get('/api/user/profile').then(res => ({
      ...res,
      data: {
        ...res.data?.data,
        avatarUrl: res.data?.data?.avatar,
      },
    })),

  updateProfile: (data: {fullName?: string; email?: string; birthday?: string}) =>
    api.put('/api/user/profile', data),

  changePassword: (data: {oldPassword: string; newPassword: string}) =>
    api.put('/api/user/password', {
      ...data,
      confirmNewPassword: data.newPassword,
    }),

  uploadAvatar: (formData: FormData) =>
    api.post('/api/user/avatar', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }).then(res => ({
      ...res,
      data: {
        avatarUrl: res.data?.data,
      },
    })),
};

export default ProfileAPI;
