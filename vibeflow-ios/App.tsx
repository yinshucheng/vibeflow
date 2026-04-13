import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from '@/navigation';
import { AppProvider } from '@/providers';
import { ChatFAB, ChatPanel } from '@/components/chat';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function App(): React.JSX.Element {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
          <ChatFAB />
          <ChatPanel />
        </AppProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
