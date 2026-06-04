import api from './api';

const AuthAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', {username, password}),

  register: (data: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) =>
    api.post('/auth/register', {
      fullname: data.fullName,
      username: data.username,
      email: data.email,
      password: data.password,
      confirmPassword: data.confirmPassword,
    }),

  sendOtp: (email: string) =>
    api.post('/auth/send-otp', {}, {params: {email}}),

  verifyOtp: (email: string, otp: string) =>
    api.post('/auth/verify-otp', {}, {params: {email, otp}}),

  checkEmail: (email: string) =>
    api.get('/auth/check-email', {params: {email}}),

  checkUsername: (username: string) =>
    api.get('/auth/check-username', {params: {username}}),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', {email}),

  resetPassword: (email: string, newPassword: string) =>
    api.post('/auth/reset-password', {}, {params: {email, newPassword}}),

  firebaseLogin: (idToken: string) =>
    api.post('/auth/firebase-login', {idToken}),

  googleLogin: (idToken: string) =>
    api.post('/auth/google-login', {idToken}),
};

export default AuthAPI;
