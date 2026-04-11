import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import GroupListScreen from '../screens/group/GroupListScreen';
import GroupWorkspaceScreen from '../screens/home/GroupWorkspaceScreen';
import GroupManagementScreen from '../screens/home/GroupManagementScreen';
import PracticeQuizScreen from '../screens/quiz/PracticeQuizScreen';
import ExamQuizScreen from '../screens/quiz/ExamQuizScreen';
import QuizResultScreen from '../screens/quiz/QuizResultScreen';
import VoicePracticeQuizScreen from '../screens/quiz/VoicePracticeQuizScreen';
import {type VoicePracticeConfig} from '../utils/voicePractice';

export type QuizBackContext =
  | {type: 'quiz-list'}
  | {type: 'workspace'; workspaceId: number; title?: string}
  | {type: 'group'; groupId: number; title?: string}
  | {
      type: 'roadmap';
      contextType: 'WORKSPACE' | 'GROUP';
      contextId: number;
      title?: string;
      roadmapId?: number;
      phaseId?: number;
      quizIntent?: string;
    };

export type QuizStackParamList = {
  GroupList: undefined;
  GroupWorkspace: {groupId: number; title?: string};
  GroupManagement: {groupId: number; title?: string};
  PracticeQuiz: {quizId: number; title?: string; backContext?: QuizBackContext};
  VoicePracticeQuiz: {
    quizId: number;
    title?: string;
    backContext?: QuizBackContext;
    autoStart?: boolean;
    voiceConfig?: VoicePracticeConfig;
  };
  ExamQuiz: {quizId: number; title?: string; backContext?: QuizBackContext};
  QuizResult: {attemptId: number; backContext?: QuizBackContext};
};

const Stack = createStackNavigator<QuizStackParamList>();

export default function QuizStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="GroupList" component={GroupListScreen} />
      <Stack.Screen name="GroupWorkspace" component={GroupWorkspaceScreen} />
      <Stack.Screen name="GroupManagement" component={GroupManagementScreen} />
      <Stack.Screen name="PracticeQuiz" component={PracticeQuizScreen} />
      <Stack.Screen name="VoicePracticeQuiz" component={VoicePracticeQuizScreen} />
      <Stack.Screen name="ExamQuiz" component={ExamQuizScreen} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} />
    </Stack.Navigator>
  );
}
