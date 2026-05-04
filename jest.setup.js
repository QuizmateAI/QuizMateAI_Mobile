import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

jest.mock(
	'@react-native-async-storage/async-storage',
	() => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock(
	'@env',
	() => ({
		GOOGLE_WEB_CLIENT_ID: 'test-google-web-client-id',
	}),
	{virtual: true},
);

jest.mock('@react-native-google-signin/google-signin', () => ({
	GoogleSignin: {
		configure: jest.fn(),
		hasPlayServices: jest.fn().mockResolvedValue(true),
		hasPreviousSignIn: jest.fn().mockResolvedValue(false),
		signOut: jest.fn().mockResolvedValue(undefined),
		signIn: jest.fn().mockResolvedValue({data: {idToken: 'test-id-token'}}),
	},
	statusCodes: {
		SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
		IN_PROGRESS: 'IN_PROGRESS',
		PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
		SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
	},
}));

jest.mock('@react-native-firebase/app', () => ({
	getApps: jest.fn(() => []),
	initializeApp: jest.fn(async () => ({})),
}));

jest.mock('@react-native-firebase/auth', () => ({
	getAuth: jest.fn(() => ({})),
	GoogleAuthProvider: {
		credential: jest.fn(() => ({providerId: 'google.com'})),
	},
	signInWithCredential: jest.fn(async () => ({user: {uid: 'test-uid'}})),
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => {
	const React = require('react');
	return function MockIcon() {
		return React.createElement(React.Fragment, null);
	};
});
