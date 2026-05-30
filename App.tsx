import React from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraScreen } from './src/screens/CameraScreen';

function App(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <CameraScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
});

export default App;
