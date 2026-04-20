import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';
import ProfileScreen from '../screens/profile/ProfileScreen';
import PersonalWalletScreen from '../screens/profile/PersonalWalletScreen';
import SettingsScreen from '../screens/profile/SettingsScreen';
import SubscriptionScreen from '../screens/profile/SubscriptionScreen';
import CreditPackagesScreen from '../screens/profile/CreditPackagesScreen';
import PaymentScreen from '../screens/profile/PaymentScreen';
import PaymentResultScreen from '../screens/profile/PaymentResultScreen';

export type ProfileStackParamList = {
  ProfileMain: undefined;
  PersonalWallet: undefined;
  Settings: undefined;
  Subscription: {planType?: 'individual' | 'group'; groupId?: number} | undefined;
  CreditPackages: {workspaceId?: number; workspaceName?: string} | undefined;
  Payment: {
    planId: number;
    planName?: string;
    planType?: string;
    groupId?: number;
  };
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
};

const Stack = createStackNavigator<ProfileStackParamList>();

export default function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      <Stack.Screen name="ProfileMain" component={ProfileScreen} />
      <Stack.Screen name="PersonalWallet" component={PersonalWalletScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Subscription" component={SubscriptionScreen} />
      <Stack.Screen name="CreditPackages" component={CreditPackagesScreen} />
      <Stack.Screen name="Payment" component={PaymentScreen} />
      <Stack.Screen name="PaymentResult" component={PaymentResultScreen} />
    </Stack.Navigator>
  );
}
