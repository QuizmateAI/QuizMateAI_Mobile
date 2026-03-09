import api from './api';

const AuthAPI = {
  login: (username: string, password: string) =>
    api.post('/auth/login', {username, password}),

  register: (data: {fullName: string; username: string; email: string; password: string}) =>
    api.post('/auth/register', data),

  sendOtp: (email: string) =>
    api.post('/auth/send-otp', {email}),

  verifyOtp: (email: string, otp: string) =>
    api.post('/auth/verify-otp', {email, otp}),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', {email}),

  resetPassword: (email: string, otp: string, newPassword: string) =>
    api.post('/auth/reset-password', {email, otp, newPassword}),

  googleLogin: (idToken: string) =>
    api.post('/auth/google-login', {idToken}),
};

export default AuthAPI;
