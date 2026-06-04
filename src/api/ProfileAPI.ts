import api from './api';

const ProfileAPI = {
  getProfile: () =>
    api.get('/users/profile').then(res => ({
      ...res,
      data: {
        ...res.data?.data,
        avatarUrl: res.data?.data?.avatar,
      },
    })),

  updateProfile: (data: {fullName?: string; email?: string; birthday?: string}) =>
    api.put('/users/profile', data),

  changePassword: (data: {oldPassword: string; newPassword: string}) =>
    api.put('/users/password', {
      ...data,
      confirmNewPassword: data.newPassword,
    }),

  uploadAvatar: (formData: FormData) =>
    api.post('/users/avatar', formData, {
      headers: {'Content-Type': 'multipart/form-data'},
    }).then(res => ({
      ...res,
      data: {
        avatarUrl: res.data?.data,
      },
    })),
};

export default ProfileAPI;
