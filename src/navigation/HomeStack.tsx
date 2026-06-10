import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from '../screens/home/HomeScreen';
import WorkspaceScreen from '../screens/home/WorkspaceScreen';
import GroupWorkspaceScreen from '../screens/home/GroupWorkspaceScreen';
import GroupManagementScreen from '../screens/home/GroupManagementScreen';
import CreateAIQuizScreen from '../screens/home/CreateAIQuizScreen';
import WorkspaceProfileWizardScreen from '../screens/home/WorkspaceProfileWizardScreen';
import CreateAIFlashcardScreen from '../screens/home/CreateAIFlashcardScreen';
import RoadmapJourneyScreen from '../screens/home/RoadmapJourneyScreen';
import MaterialDetailScreen from '../screens/home/MaterialDetailScreen';
import FlashcardStudyScreen from '../screens/home/FlashcardStudyScreen';
import QuizCollectionScreen from '../screens/home/QuizCollectionScreen';
import PracticeQuizScreen from '../screens/quiz/PracticeQuizScreen';
import VoicePracticeQuizScreen from '../screens/quiz/VoicePracticeQuizScreen';
import QuizResultScreen from '../screens/quiz/QuizResultScreen';
import type {
  QuizBackContext,
  QuizDetailRouteParams,
} from './QuizStack';
import {type VoicePracticeConfig} from '../utils/voicePractice';

export type HomeStackParamList = {
  HomeMain: undefined;
  Workspace: {workspaceId: number; title?: string; initialTab?: 'chat' | 'sources' | 'stats' | 'studio'};
  GroupWorkspace: {
    groupId: number;
    title?: string;
    initialTab?: 'chat' | 'sources' | 'studio' | 'challenge' | 'ranking' | 'notifications';
    detailKey?: 'challenge' | 'ranking' | 'notifications';
  };
  GroupManagement: {
    groupId: number;
    title?: string;
    initialTab?: 'dashboard' | 'members' | 'ranking' | 'logs' | 'wallet' | 'settings';
  };
  CreateAIQuiz: {workspaceId: number; materials?: any[]; initialMode?: 'ai' | 'manual'};
  QuizCollection: {
    workspaceId: number;
    title?: string;
    canCreateCollection?: boolean;
    initialCollectionId?: number;
  };
  CreateAIFlashcard: {workspaceId: number; materials?: any[]};
  FlashcardStudy: {
    flashcardId: number;
    title?: string;
    contextType?: 'WORKSPACE' | 'GROUP';
    contextId?: number;
    workspaceId?: number;
    groupId?: number;
    backTitle?: string;
  };
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
  QuizResult: {attemptId: number; backContext?: QuizBackContext};
  RoadmapJourney: {
    contextType: 'WORKSPACE' | 'GROUP';
    contextId: number;
    title?: string;
    materials?: any[];
    roadmapId?: number;
    phaseId?: number;
  };
  MaterialDetail: {
    material: any;
    contextType?: 'WORKSPACE' | 'GROUP';
    workspaceId?: number;
    groupId?: number;
    backContext?: {
      type: 'workspace' | 'group';
      workspaceId?: number;
      groupId?: number;
      title?: string;
      initialTab?: 'sources';
    };
  };
  WorkspaceProfileWizard: {
    workspaceId: number;
    title?: string;
    contextType?: 'WORKSPACE' | 'GROUP';
  };
};

const Stack = createStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Workspace" component={WorkspaceScreen} />
      <Stack.Screen name="GroupWorkspace" component={GroupWorkspaceScreen} />
      <Stack.Screen name="GroupManagement" component={GroupManagementScreen} />
      <Stack.Screen name="CreateAIQuiz" component={CreateAIQuizScreen} />
      <Stack.Screen name="QuizCollection" component={QuizCollectionScreen} />
      <Stack.Screen
        name="CreateAIFlashcard"
        component={CreateAIFlashcardScreen}
      />
      <Stack.Screen name="FlashcardStudy" component={FlashcardStudyScreen} />
      <Stack.Screen name="PracticeQuiz" component={PracticeQuizScreen} />
      <Stack.Screen name="VoicePracticeQuiz" component={VoicePracticeQuizScreen} />
      <Stack.Screen name="QuizResult" component={QuizResultScreen} />
      <Stack.Screen name="RoadmapJourney" component={RoadmapJourneyScreen} />
      <Stack.Screen
        name="WorkspaceProfileWizard"
        component={WorkspaceProfileWizardScreen}
      />
      <Stack.Screen name="MaterialDetail" component={MaterialDetailScreen} />
    </Stack.Navigator>
  );
}
