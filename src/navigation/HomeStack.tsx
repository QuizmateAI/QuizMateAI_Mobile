import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import HomeScreen from '../screens/home/HomeScreen';
import WorkspaceScreen from '../screens/home/WorkspaceScreen';
import GroupWorkspaceScreen from '../screens/home/GroupWorkspaceScreen';
import GroupManagementScreen from '../screens/home/GroupManagementScreen';

export type HomeStackParamList = {
  HomeMain: undefined;
  Workspace: {workspaceId: number; title?: string};
  GroupWorkspace: {groupId: number; title?: string};
  GroupManagement: {groupId: number; title?: string};
};

const Stack = createStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Workspace" component={WorkspaceScreen} />
      <Stack.Screen name="GroupWorkspace" component={GroupWorkspaceScreen} />
      <Stack.Screen name="GroupManagement" component={GroupManagementScreen} />
    </Stack.Navigator>
  );
}
