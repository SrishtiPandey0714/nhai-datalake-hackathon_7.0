import React, { useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { LIVENESS_CONSTANTS } from '../constants/liveness';

export const CameraScreen: React.FC = () => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(LIVENESS_CONSTANTS.DEFAULT_CAMERA_POSITION);

  // Trigger permission request on mount if not already granted
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0E12" />
        <View style={styles.card}>
          <Text style={styles.title}>Camera Access Required</Text>
          <Text style={styles.description}>
            To perform offline facial authentication, the app needs permission to access your front camera.
          </Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0D0E12" />
        <View style={styles.card}>
          <Text style={styles.title}>No Camera Detected</Text>
          <Text style={styles.description}>
            A compatible front-facing camera device could not be detected on this device.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live Camera Preview */}
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={true}
        enableNativeZoomGesture={false}
      />

      {/* Modern UI Overlay */}
      <View style={styles.overlayContainer}>
        {/* Top Header Card (Glassmorphism inspired) */}
        <View style={styles.headerCard}>
          <Text style={styles.headerText}>OFFLINE FACIAL AUTHENTICATION</Text>
          <View style={styles.badge}>
            <View style={styles.dot} />
            <Text style={styles.badgeText}>Milestone 1: Camera Active</Text>
          </View>
        </View>

        {/* Center Target Frame Guide */}
        <View style={styles.focusFrameContainer}>
          <View style={styles.focusFrame} />
        </View>

        {/* Bottom Instruction Panel */}
        <View style={styles.footerPanel}>
          <Text style={styles.instructionTitle}>Position Your Face</Text>
          <Text style={styles.instructionSubtitle}>
            Ensure your face is centered inside the frame in a well-lit environment.
          </Text>

          <View style={styles.statusBox}>
            <ActivityIndicator size="small" color="#4B7BFF" style={styles.loader} />
            <Text style={styles.statusText}>Stream Active (New Arch Compatible)</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '85%',
    backgroundColor: '#161820',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#242736',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 14,
    color: '#8A8F9E',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  button: {
    width: '100%',
    height: 52,
    backgroundColor: '#4B7BFF',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4B7BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  overlayContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: StatusBar.currentHeight ? StatusBar.currentHeight + 20 : 60,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: 'rgba(22, 24, 32, 0.85)',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headerText: {
    color: '#9BA3B5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(75, 123, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4B7BFF',
    marginRight: 6,
  },
  badgeText: {
    color: '#4B7BFF',
    fontSize: 11,
    fontWeight: '700',
  },
  focusFrameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 40,
  },
  focusFrame: {
    width: 260,
    height: 340,
    borderRadius: 130, // Oval shape for portrait face mapping
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderStyle: 'dashed',
  },
  footerPanel: {
    backgroundColor: 'rgba(22, 24, 32, 0.9)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  instructionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  instructionSubtitle: {
    fontSize: 13,
    color: '#8A8F9E',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101116',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#242736',
  },
  loader: {
    marginRight: 10,
  },
  statusText: {
    color: '#A0A5B5',
    fontSize: 12,
    fontWeight: '600',
  },
});
