import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import GroupListScreen from '../screens/group/GroupListScreen';
import GroupWorkspaceScreen from '../screens/home/GroupWorkspaceScreen';
import GroupManagementScreen from '../screens/home/GroupManagementScreen';
import PracticeQuizScreen from '../screens/quiz/PracticeQuizScreen';
import ExamQuizScreen from '../screens/quiz/ExamQuizScreen';
import QuizResultScreen from '../screens/quiz/QuizResultScreen';
import VoicePracticeQuizScreen from '../screens/quiz/VoicePracticeQuizScreen';
import QuizDetailScreen from '../screens/quiz/QuizDetailScreen';
import WorkspaceProfileWizardScreen from '../screens/home/WorkspaceProfileWizardScreen';
import SubscriptionScreen from '../screens/profile/SubscriptionScreen';
import CreditPackagesScreen from '../screens/profile/CreditPackagesScreen';
import PaymentScreen from '../screens/profile/PaymentScreen';
import PaymentResultScreen from '../screens/profile/PaymentResultScreen';
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

export type QuizDetailRouteParams = {
  quizId: number;
  title?: string;
  quiz?: any;
  backContext?: QuizBackContext;
  contextType?: 'WORKSPACE' | 'GROUP' | 'ROADMAP' | 'PHASE' | 'KNOWLEDGE';
  contextId?: number;
  workspaceId?: number;
  groupId?: number;
  roadmapId?: number;
  phaseId?: number;
  quizIntent?: string;
  roadmapTitle?: string;
  phaseTitle?: string;
};

export type QuizStackParamList = {
  GroupList: undefined;
  GroupWorkspace: {groupId: number; title?: string};
  GroupManagement: {
    groupId: number;
    title?: string;
    initialTab?: 'dashboard' | 'members' | 'ranking' | 'logs' | 'settings';
  };
  Subscription: {planType?: 'individual' | 'group'; groupId?: number} | undefined;
  CreditPackages: {workspaceId?: number; workspaceName?: string} | undefined;
  Payment: {planId: number; planName?: string; planType?: string; groupId?: number};
  PaymentResult: {
    status: string;
    orderId?: string;
    amount?: number;
    orderInfo?: string;
    transId?: string;
    payType?: string;
    responseTime?: string;
    purchaseType?: 'plan' | 'credit';
  };
  WorkspaceProfileWizard: {
    workspaceId: number;
    title?: string;
    contextType?: 'WORKSPACE' | 'GROUP';
  };
  QuizDetail: QuizDetailRouteParams;
  PracticeQuiz: {
    quizId: number;
    title?: string;
    backContext?: QuizBackContext;
    quizDetailParams?: QuizDetailRouteParams;
  };
  VoicePracticeQuiz: {
    quizId: number;
    title?: string;
    backContext?: QuizBackContext;
    autoStart?: boolean;
    voiceConfig?: VoicePracticeConfig;
  };
  ExamQuiz: {
    quizId: number;
    title?: string;
    backContext?: QuizBackContext;
    quizDetailParams?: QuizDetailRouteParams;
  };
  QuizResult: {attemptId: number; backContext?: QuizBackContext};
};

const Stack = createStackNavigator<QuizStackParamList>();

export default function QuizStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="GroupList" component={GroupListScreen} />
      <Stack.Screen name="GroupWorkspace" component={GroupWorkspaceScreen} />
      <Stack.Screen name="GroupManagement" component={GroupManagementScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="CreditPackages" component={CreditPackagesScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="PaymentResult" component={PaymentResultScreen} />
      <Stack.Screen
        name="WorkspaceProfileWizard"
        component={WorkspaceProfileWizardScreen}
      />
      <Stack.Screen name="QuizDetail" component={QuizDetailScreen} />
      <Stack.Screen name="PracticeQuiz" component={PracticeQuizScreen} />
      <Stack.Screen name="VoicePracticeQuiz" component={VoicePracticeQuizScreen} />
      <Stack.Screen name="ExamQuiz" component={ExamQuizScreen} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} />
    </Stack.Navigator>
  );
}
