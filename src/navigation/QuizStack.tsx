import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import QuizListScreen from '../screens/quiz/QuizListScreen';
import PracticeQuizScreen from '../screens/quiz/PracticeQuizScreen';
import ExamQuizScreen from '../screens/quiz/ExamQuizScreen';
import QuizResultScreen from '../screens/quiz/QuizResultScreen';

export type QuizBackContext =
  | {type: 'quiz-list'}
  | {type: 'workspace'; workspaceId: number; title?: string}
  | {type: 'group'; groupId: number; title?: string}
  | {
      type: 'roadmap';
      contextType: 'WORKSPACE' | 'GROUP';
      contextId: number;
      title?: string;
    };

export type QuizStackParamList = {
  QuizList: undefined;
  PracticeQuiz: {quizId: number; title?: string; backContext?: QuizBackContext};
  ExamQuiz: {quizId: number; title?: string; backContext?: QuizBackContext};
  QuizResult: {attemptId: number; backContext?: QuizBackContext};
};

const Stack = createStackNavigator<QuizStackParamList>();

export default function QuizStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="QuizList" component={QuizListScreen} />
      <Stack.Screen name="PracticeQuiz" component={PracticeQuizScreen} />
      <Stack.Screen name="ExamQuiz" component={ExamQuizScreen} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} />
    </Stack.Navigator>
  );
}
