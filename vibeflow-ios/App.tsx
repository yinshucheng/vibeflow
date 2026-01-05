import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabNavigator } from '@/navigation';
import { AppProvider } from '@/providers';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <NavigationContainer>
          <TabNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </AppProvider>
    </SafeAreaProvider>
  );
}
