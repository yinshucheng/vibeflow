/**
 * Root Navigator
 *
 * Wraps the tab navigator in a native stack to support
 * modal screens (like HabitFormScreen) that overlay tabs.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TabNavigator } from './TabNavigator';
import { HabitFormScreen } from '@/screens/HabitFormScreen';
import type { HabitData } from '@/types';

export type RootStackParamList = {
  Tabs: undefined;
  HabitForm: { habitId?: string; habit?: HabitData } | undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): React.JSX.Element {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="HabitForm"
        component={HabitFormScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
