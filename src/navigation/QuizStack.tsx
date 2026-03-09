import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import QuizListScreen from '../screens/quiz/QuizListScreen';
import PracticeQuizScreen from '../screens/quiz/PracticeQuizScreen';
import ExamQuizScreen from '../screens/quiz/ExamQuizScreen';
import QuizResultScreen from '../screens/quiz/QuizResultScreen';

export type QuizStackParamList = {
  QuizList: undefined;
  PracticeQuiz: {quizId: number; title?: string};
  ExamQuiz: {quizId: number; title?: string};
  QuizResult: {attemptId: number};
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
