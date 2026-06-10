import React, {useMemo} from 'react';
import {StyleSheet, View, Platform} from 'react-native';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {getFocusedRouteNameFromRoute, RouteProp} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import HomeStack from './HomeStack';
import QuizStack from './QuizStack';
import CommunityStack from './CommunityStack';
import ProfileStack from './ProfileStack';
import {useTheme} from '../context/ThemeContext';
import {Colors} from '../theme/colors';

export type MainTabParamList = {
  Home: undefined;
  Quiz: undefined;
  Community: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabNavigator() {
  const {isDark, colors} = useTheme();

  const baseTabBarStyle = useMemo(
    () => ({
      backgroundColor: isDark ? Colors.dark.surface : '#FFFFFF',
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      height: Platform.OS === 'ios' ? 88 : 64,
      paddingBottom: Platform.OS === 'ios' ? 28 : 8,
      paddingTop: 8,
      elevation: 0,
      shadowOpacity: 0,
    }),
    [colors.border, isDark],
  );
  const hiddenTabBarStyle = useMemo(() => ({display: 'none' as const}), []);

  const getHomeTabBarStyle = (route: RouteProp<MainTabParamList, 'Home'>) => {
    const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'HomeMain';
    if (
      focusedRoute === 'Workspace' ||
      focusedRoute === 'GroupWorkspace' ||
      focusedRoute === 'MaterialDetail' ||
      focusedRoute === 'RoadmapJourney' ||
      focusedRoute === 'QuizCollection' ||
      focusedRoute === 'QuizDetail' ||
      focusedRoute === 'PracticeQuiz' ||
      focusedRoute === 'ExamQuiz' ||
      focusedRoute === 'VoicePracticeQuiz' ||
      focusedRoute === 'QuizResult'
    ) {
      return hiddenTabBarStyle;
    }
    return baseTabBarStyle;
  };

  const getQuizTabBarStyle = (route: RouteProp<MainTabParamList, 'Quiz'>) => {
    const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'GroupList';
    if (
      focusedRoute === 'GroupWorkspace' ||
      focusedRoute === 'GroupManagement' ||
      focusedRoute === 'RoadmapJourney' ||
      focusedRoute === 'QuizDetail' ||
      focusedRoute === 'PracticeQuiz' ||
      focusedRoute === 'ExamQuiz' ||
      focusedRoute === 'VoicePracticeQuiz' ||
      focusedRoute === 'QuizResult'
    ) {
      return hiddenTabBarStyle;
    }
    return baseTabBarStyle;
  };

  const getCommunityTabBarStyle = (route: RouteProp<MainTabParamList, 'Community'>) => {
    const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'CommunityGroup';
    if (
      focusedRoute === 'GroupWorkspace' ||
      focusedRoute === 'GroupManagement' ||
      focusedRoute === 'RoadmapJourney' ||
      focusedRoute === 'QuizDetail' ||
      focusedRoute === 'PracticeQuiz' ||
      focusedRoute === 'ExamQuiz' ||
      focusedRoute === 'VoicePracticeQuiz' ||
      focusedRoute === 'QuizResult'
    ) {
      return hiddenTabBarStyle;
    }
    return baseTabBarStyle;
  };

  const getProfileTabBarStyle = (route: RouteProp<MainTabParamList, 'Profile'>) => {
    const focusedRoute = getFocusedRouteNameFromRoute(route) ?? 'ProfileMain';
    if (
      focusedRoute === 'Payment' ||
      focusedRoute === 'PaymentWebView' ||
      focusedRoute === 'PaymentResult'
    ) {
      return hiddenTabBarStyle;
    }
    return baseTabBarStyle;
  };

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: baseTabBarStyle,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}>
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={({route}) => ({
          tabBarLabel: 'Cá nhân',
          tabBarStyle: getHomeTabBarStyle(route),
          tabBarIcon: ({color, size, focused}) => (
            <TabIcon name={focused ? 'account' : 'account-outline'} color={color} size={size} />
          ),
        })}
      />
      <Tab.Screen
        name="Quiz"
        component={QuizStack}
        listeners={({navigation}) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.navigate('Quiz', {screen: 'GroupList'} as never);
          },
        })}
        options={({route}) => ({
          tabBarLabel: 'Nhóm',
          tabBarStyle: getQuizTabBarStyle(route),
          tabBarIcon: ({color, size, focused}) => (
            <TabIcon name={focused ? 'account-group' : 'account-group-outline'} color={color} size={size} />
          ),
        })}
      />
      <Tab.Screen
        name="Community"
        component={CommunityStack}
        options={({route}) => ({
          tabBarLabel: 'Cộng đồng',
          tabBarStyle: getCommunityTabBarStyle(route),
          tabBarIcon: ({color, size, focused}) => (
            <TabIcon name={focused ? 'earth' : 'web'} color={color} size={size} />
          ),
        })}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={({route}) => ({
          tabBarLabel: 'Hồ sơ',
          tabBarStyle: getProfileTabBarStyle(route),
          tabBarIcon: ({color, size, focused}) => (
            <TabIcon name={focused ? 'account-circle' : 'account-circle-outline'} color={color} size={size} />
          ),
        })}
      />
    </Tab.Navigator>
  );
}

function TabIcon({
  name,
  color,
  size,
}: {
  name: string;
  color: string;
  size: number;
}) {
  return (
    <View style={styles.iconContainer}>
      <Icon name={name} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
