/**
 * Alemeno Marker Detection App
 * React Native Android Application
 *
 * Detects Marker 1: Square black border (140x140) with a 20x20 black square
 * in the top-left corner as an orientation anchor.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import CameraScreen from './src/screens/CameraScreen';
import ResultScreen from './src/screens/ResultScreen';

export type RootStackParamList = {
  Camera: undefined;
  Results: { markers: string[] };
};

const Stack = createStackNavigator<RootStackParamList>();

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Camera"
            screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="Results" component={ResultScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export default App;
