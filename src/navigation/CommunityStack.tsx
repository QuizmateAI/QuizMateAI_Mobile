import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import CommunityGroupScreen from '../screens/group/CommunityGroupScreen';
import GroupWorkspaceScreen from '../screens/home/GroupWorkspaceScreen';
import GroupManagementScreen from '../screens/home/GroupManagementScreen';
import WorkspaceProfileWizardScreen from '../screens/home/WorkspaceProfileWizardScreen';
import SubscriptionScreen from '../screens/profile/SubscriptionScreen';
import CreditPackagesScreen from '../screens/profile/CreditPackagesScreen';
import PaymentScreen from '../screens/profile/PaymentScreen';
import PaymentWebViewScreen from '../screens/profile/PaymentWebViewScreen';
import PaymentResultScreen from '../screens/profile/PaymentResultScreen';
import FlashcardStudyScreen from '../screens/home/FlashcardStudyScreen';
import RoadmapJourneyScreen from '../screens/home/RoadmapJourneyScreen';
import QuizDetailScreen from '../screens/quiz/QuizDetailScreen';
import PracticeQuizScreen from '../screens/quiz/PracticeQuizScreen';
import ExamQuizScreen from '../screens/quiz/ExamQuizScreen';
import VoicePracticeQuizScreen from '../screens/quiz/VoicePracticeQuizScreen';
import QuizResultScreen from '../screens/quiz/QuizResultScreen';
import {type QuizDetailRouteParams} from './QuizStack';
import {type VoicePracticeConfig} from '../utils/voicePractice';

export type CommunityStackParamList = {
  CommunityGroup: undefined;
  GroupWorkspace: {
    groupId: number;
    title?: string;
    detailKey?: 'challenge' | 'ranking' | 'notifications';
  };
  GroupManagement: {
    groupId: number;
    title?: string;
    initialTab?: 'dashboard' | 'members' | 'ranking' | 'logs' | 'wallet' | 'settings';
  };
  WorkspaceProfileWizard: {
    workspaceId: number;
    title?: string;
    contextType?: 'WORKSPACE' | 'GROUP';
  };
  Subscription:
    | {
        planType?: 'individual' | 'group';
        workspaceId?: number;
        workspaceName?: string;
      }
    | undefined;
  CreditPackages: {workspaceId?: number; workspaceName?: string} | undefined;
  Payment: any;
  PaymentWebView: any;
  PaymentResult: any;
  FlashcardStudy: any;
  RoadmapJourney: any;
  QuizDetail: QuizDetailRouteParams;
  PracticeQuiz: {
    quizId: number;
    title?: string;
    backContext?: any;
    quizDetailParams?: QuizDetailRouteParams;
  };
  VoicePracticeQuiz: {
    quizId: number;
    title?: string;
    backContext?: any;
    autoStart?: boolean;
    voiceConfig?: VoicePracticeConfig;
  };
  ExamQuiz: {
    quizId: number;
    title?: string;
    backContext?: any;
    quizDetailParams?: QuizDetailRouteParams;
    challengeContext?: any;
    challengeAttempt?: any;
  };
  QuizResult: {attemptId: number; backContext?: any};
};

const Stack = createStackNavigator<CommunityStackParamList>();

export default function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="CommunityGroup" component={CommunityGroupScreen} />
      <Stack.Screen name="GroupWorkspace" component={GroupWorkspaceScreen} />
      <Stack.Screen name="GroupManagement" component={GroupManagementScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="CreditPackages" component={CreditPackagesScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="PaymentWebView" component={PaymentWebViewScreen} />
      <Stack.Screen name="PaymentResult" component={PaymentResultScreen} />
      <Stack.Screen
        name="WorkspaceProfileWizard"
        component={WorkspaceProfileWizardScreen}
      />
      <Stack.Screen name="FlashcardStudy" component={FlashcardStudyScreen} />
      <Stack.Screen name="RoadmapJourney" component={RoadmapJourneyScreen} />
      <Stack.Screen name="QuizDetail" component={QuizDetailScreen} />
      <Stack.Screen name="PracticeQuiz" component={PracticeQuizScreen} />
      <Stack.Screen name="VoicePracticeQuiz" component={VoicePracticeQuizScreen} />
      <Stack.Screen name="ExamQuiz" component={ExamQuizScreen} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} />
    </Stack.Navigator>
  );
}
