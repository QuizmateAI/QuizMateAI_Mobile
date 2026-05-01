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

export type HomeStackParamList = {
  HomeMain: undefined;
  Workspace: {workspaceId: number; title?: string};
  GroupWorkspace: {groupId: number; title?: string};
  GroupManagement: {groupId: number; title?: string};
  CreateAIQuiz: {workspaceId: number; materials?: any[]; initialMode?: 'ai' | 'manual'};
  CreateAIFlashcard: {workspaceId: number; materials?: any[]};
  FlashcardStudy: {flashcardId: number; title?: string; contextType?: 'WORKSPACE' | 'GROUP'};
  RoadmapJourney: {
    contextType: 'WORKSPACE' | 'GROUP';
    contextId: number;
    title?: string;
    materials?: any[];
    roadmapId?: number;
    phaseId?: number;
  };
  MaterialDetail: {material: any};
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
      <Stack.Screen
        name="CreateAIFlashcard"
        component={CreateAIFlashcardScreen}
      />
      <Stack.Screen name="FlashcardStudy" component={FlashcardStudyScreen} />
      <Stack.Screen name="RoadmapJourney" component={RoadmapJourneyScreen} />
      <Stack.Screen
        name="WorkspaceProfileWizard"
        component={WorkspaceProfileWizardScreen}
      />
      <Stack.Screen name="MaterialDetail" component={MaterialDetailScreen} />
    </Stack.Navigator>
  );
}
