import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor, VisionCameraProxy } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { LIVENESS_CONSTANTS } from '../constants/liveness';
import { calculateEAR, detectHeadTurn } from '../../livenessMath';

// File-level frame counter to throttle execution safely in the worklet thread
let frameCounter = 0;

// Helper to determine if face is centered in the frame
const isFaceCentered = (landmarks: any) => {
  const nose = landmarks[LIVENESS_CONSTANTS.NOSE_TIP_POINT];
  const leftEdge = landmarks[LIVENESS_CONSTANTS.LEFT_FACE_EDGE_POINT];
  const rightEdge = landmarks[LIVENESS_CONSTANTS.RIGHT_FACE_EDGE_POINT];
  if (!nose || !leftEdge || !rightEdge) return false;
  
  // Check if nose is in center box (normalized [0, 1])
  const isNoseCentered = nose.x > 0.35 && nose.x < 0.65 && nose.y > 0.30 && nose.y < 0.70;
  
  // Verify face scale (distance between left/right edges must be at least 0.15)
  const faceWidth = Math.abs(leftEdge.x - rightEdge.x);
  const isScaleAdequate = faceWidth > 0.15;
  
  return isNoseCentered && isScaleAdequate;
};

type LivenessState =
  | 'WAITING_FOR_FACE'
  | 'FACE_CENTERED'
  | 'BLINK'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'PASSED'
  | 'FAILED';

export const CameraScreen: React.FC = () => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(LIVENESS_CONSTANTS.DEFAULT_CAMERA_POSITION);

  // Initialize frame processor plugin for MediaPipe Face Mesh
  const plugin = useRef(VisionCameraProxy.initFrameProcessorPlugin('detectFaceMesh', {})).current;

  // Liveness state machine states
  const [livenessState, setLivenessState] = useState<LivenessState>('WAITING_FOR_FACE');
  const [noFaceFrameCount, setNoFaceFrameCount] = useState(0);
  const [showTelemetry, setShowTelemetry] = useState(false);

  // Live telemetry metrics
  const [fps, setFps] = useState(0);
  const [liveEar, setLiveEar] = useState(0);
  const [liveYaw, setLiveYaw] = useState(0);
  const [direction, setDirection] = useState<'STRAIGHT' | 'LEFT' | 'RIGHT'>('STRAIGHT');

  // Histories for 5-frame smoothing (sliding window)
  const earHistoryRef = useRef<number[]>([]);
  const yawHistoryRef = useRef<number[]>([]);
  const consecutiveMatchRef = useRef<number>(0);
  const blinkSubStateRef = useRef<'LOOKING_FOR_CLOSED' | 'LOOKING_FOR_OPEN'>('LOOKING_FOR_CLOSED');
  
  // Performance and timers
  const lastFrameTimeRef = useRef<number>(0);
  const stateStartTimeRef = useRef<number>(0);
  const currentLivenessStateRef = useRef<LivenessState>('WAITING_FOR_FACE');

  // Sync state ref to avoid closure issues inside async worklet callback
  useEffect(() => {
    currentLivenessStateRef.current = livenessState;
  }, [livenessState]);

  // Start state timers on state change
  useEffect(() => {
    stateStartTimeRef.current = Date.now();
    consecutiveMatchRef.current = 0;
    blinkSubStateRef.current = 'LOOKING_FOR_CLOSED';
  }, [livenessState]);

  // Reset the liveness validation state machine
  const resetLiveness = useCallback(() => {
    earHistoryRef.current = [];
    yawHistoryRef.current = [];
    consecutiveMatchRef.current = 0;
    blinkSubStateRef.current = 'LOOKING_FOR_CLOSED';
    setLivenessState('WAITING_FOR_FACE');
    setNoFaceFrameCount(0);
  }, []);

  // Safe handler callback to update state from the frame processor thread
  const processLandmarks = useCallback((landmarks: any) => {
    // 1. Calculate FPS
    const now = Date.now();
    if (lastFrameTimeRef.current > 0) {
      const delta = now - lastFrameTimeRef.current;
      setFps(Math.round(1000 / delta));
    }
    lastFrameTimeRef.current = now;

    // 2. Handle No Face Detected cases
    if (!landmarks) {
      setNoFaceFrameCount(prev => {
        const next = prev + 1;
        // If face is lost for 5 consecutive frames, drop back to WAITING_FOR_FACE
        if (next >= 5 &&
            currentLivenessStateRef.current !== 'WAITING_FOR_FACE' &&
            currentLivenessStateRef.current !== 'PASSED' &&
            currentLivenessStateRef.current !== 'FAILED') {
          setLivenessState('WAITING_FOR_FACE');
        }
        return next;
      });
      return;
    }
    setNoFaceFrameCount(0);

    // 3. Extract eye landmarks and calculate EAR
    const leftEye = LIVENESS_CONSTANTS.LEFT_EYE_POINTS.map(idx => landmarks[idx]);
    const rightEye = LIVENESS_CONSTANTS.RIGHT_EYE_POINTS.map(idx => landmarks[idx]);
    
    // We pass 1000, 1000 for coordinates scale (landmarks are normalized [0, 1])
    const w = 1000;
    const h = 1000;
    
    const leftEAR = calculateEAR(leftEye, w, h);
    const rightEAR = calculateEAR(rightEye, w, h);
    const avgEAR = (leftEAR + rightEAR) / 2.0;

    // Smooth EAR using 5-frame sliding window
    earHistoryRef.current.push(avgEAR);
    if (earHistoryRef.current.length > LIVENESS_CONSTANTS.SMOOTHING_WINDOW_SIZE) {
      earHistoryRef.current.shift();
    }
    const smoothedEAR = earHistoryRef.current.reduce((a, b) => a + b, 0) / earHistoryRef.current.length;
    setLiveEar(smoothedEAR);

    // 4. Extract landmarks for head turn and calculate ratio/direction
    const headTurnResult = detectHeadTurn(landmarks, w, h);
    
    // Smooth Yaw ratio using 5-frame sliding window
    yawHistoryRef.current.push(headTurnResult.ratio);
    if (yawHistoryRef.current.length > LIVENESS_CONSTANTS.SMOOTHING_WINDOW_SIZE) {
      yawHistoryRef.current.shift();
    }
    const smoothedYawRatio = yawHistoryRef.current.reduce((a, b) => a + b, 0) / yawHistoryRef.current.length;
    setLiveYaw(smoothedYawRatio);

    // Determine direction from smoothed yaw ratio
    let smoothedDirection: 'STRAIGHT' | 'LEFT' | 'RIGHT' = 'STRAIGHT';
    if (smoothedYawRatio < LIVENESS_CONSTANTS.YAW_LEFT_THRESHOLD) {
      smoothedDirection = 'LEFT';
    } else if (smoothedYawRatio > LIVENESS_CONSTANTS.YAW_RIGHT_THRESHOLD) {
      smoothedDirection = 'RIGHT';
    }
    setDirection(smoothedDirection);

    // 5. State Machine Transition Logic
    setLivenessState(currentState => {
      if (currentState === 'PASSED' || currentState === 'FAILED') return currentState;

      // Reset on face lost
      if (currentState === 'WAITING_FOR_FACE') {
        if (isFaceCentered(landmarks)) {
          return 'FACE_CENTERED';
        }
        return 'WAITING_FOR_FACE';
      }

      // Check timeout (except for initial WAITING_FOR_FACE)
      const elapsed = Date.now() - stateStartTimeRef.current;
      if (elapsed > LIVENESS_CONSTANTS.STATE_TIMEOUT_MS) {
        return 'FAILED';
      }

      switch (currentState) {
        case 'FACE_CENTERED': {
          if (!isFaceCentered(landmarks)) {
            // Drop back if face is misaligned
            return 'FACE_CENTERED';
          }
          consecutiveMatchRef.current += 1;
          if (consecutiveMatchRef.current >= 5) {
            consecutiveMatchRef.current = 0;
            return 'BLINK';
          }
          return 'FACE_CENTERED';
        }

        case 'BLINK': {
          // Blink event transition detection: OPEN -> CLOSED (EAR < 0.22) -> OPEN (EAR > 0.25)
          if (blinkSubStateRef.current === 'LOOKING_FOR_CLOSED') {
            if (smoothedEAR < LIVENESS_CONSTANTS.EAR_THRESHOLD) {
              blinkSubStateRef.current = 'LOOKING_FOR_OPEN';
            }
          } else if (blinkSubStateRef.current === 'LOOKING_FOR_OPEN') {
            if (smoothedEAR > 0.25) {
              blinkSubStateRef.current = 'LOOKING_FOR_CLOSED';
              return 'TURN_LEFT';
            }
          }
          return 'BLINK';
        }

        case 'TURN_LEFT': {
          if (smoothedDirection === 'LEFT') {
            consecutiveMatchRef.current += 1;
            if (consecutiveMatchRef.current >= LIVENESS_CONSTANTS.CONSECUTIVE_FRAMES_THRESHOLD) {
              consecutiveMatchRef.current = 0;
              return 'TURN_RIGHT';
            }
          } else {
            consecutiveMatchRef.current = 0;
          }
          return 'TURN_LEFT';
        }

        case 'TURN_RIGHT': {
          if (smoothedDirection === 'RIGHT') {
            consecutiveMatchRef.current += 1;
            if (consecutiveMatchRef.current >= LIVENESS_CONSTANTS.CONSECUTIVE_FRAMES_THRESHOLD) {
              consecutiveMatchRef.current = 0;
              return 'PASSED';
            }
          } else {
            consecutiveMatchRef.current = 0;
          }
          return 'TURN_RIGHT';
        }

        default:
          return currentState;
      }
    });
  }, [livenessState]);

  // Safely bridge callback into isolated frame processor worklet thread
  const onFaceDetected = useRef(Worklets.createRunOnJS(processLandmarks)).current;

  // Frame processor execution logic
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    if (plugin == null) return;
    
    // Throttle: process once every 3 frames (approx. 10 FPS at 30 FPS camera output)
    frameCounter = (frameCounter + 1) % 3;
    if (frameCounter !== 0) return;

    const landmarks = plugin.call(frame);
    onFaceDetected(landmarks);
  }, [plugin, onFaceDetected]);

  // Request permissions on mount
  useEffect(() => {
    if (!hasPermission) {
      requestPermission();
    }
  }, [hasPermission, requestPermission]);

  // Dynamic border color based on validation state
  const getFocusBorderColor = () => {
    switch (livenessState) {
      case 'WAITING_FOR_FACE':
        return 'rgba(255, 255, 255, 0.3)';
      case 'FACE_CENTERED':
        return '#4B7BFF'; // Blue
      case 'BLINK':
      case 'TURN_LEFT':
      case 'TURN_RIGHT':
        return '#FFB020'; // Yellow
      case 'PASSED':
        return '#10B981'; // Green
      case 'FAILED':
        return '#EF4444'; // Red
      default:
        return 'rgba(255, 255, 255, 0.3)';
    }
  };

  // Human-readable guidance instruction
  const getInstruction = () => {
    if (noFaceFrameCount >= 5) {
      return { title: 'Face Lost', subtitle: 'Position your face clearly in the frame.' };
    }
    switch (livenessState) {
      case 'WAITING_FOR_FACE':
        return { title: 'Position Your Face', subtitle: 'Align your face inside the oval guide frame.' };
      case 'FACE_CENTERED':
        return { title: 'Aligning Face...', subtitle: 'Keep still and maintain center position.' };
      case 'BLINK':
        return { title: 'Please Blink', subtitle: 'Blink both eyes naturally to verify active presence.' };
      case 'TURN_LEFT':
        return { title: 'Turn Head Left', subtitle: 'Slowly turn your head to the left side.' };
      case 'TURN_RIGHT':
        return { title: 'Turn Head Right', subtitle: 'Slowly turn your head to the right side.' };
      case 'PASSED':
        return { title: 'Liveness Passed', subtitle: 'Offline active presence check successful.' };
      case 'FAILED':
        return { title: 'Verification Failed', subtitle: 'Verification timed out. Please try again.' };
      default:
        return { title: 'Position Your Face', subtitle: 'Ensure you are in a well-lit environment.' };
    }
  };

  const instruction = getInstruction();

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

      {/* Live Camera Preview with Frame Processor */}
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={livenessState !== 'PASSED' && livenessState !== 'FAILED'}
        enableNativeZoomGesture={false}
        frameProcessor={frameProcessor}
        pixelFormat="rgb" // MediaPipe requires RGB buffers
      />

      {/* Modern UI Overlays */}
      <View style={styles.overlayContainer}>
        {/* Top Header Card */}
        <View style={styles.headerCard}>
          <Text style={styles.headerText}>OFFLINE FACIAL AUTHENTICATION</Text>
          <View style={[styles.badge, livenessState === 'PASSED' && styles.passedBadge, livenessState === 'FAILED' && styles.failedBadge]}>
            <View style={[styles.dot, livenessState === 'PASSED' && styles.passedDot, livenessState === 'FAILED' && styles.failedDot]} />
            <Text style={[styles.badgeText, livenessState === 'PASSED' && styles.passedText, livenessState === 'FAILED' && styles.failedText]}>
              {livenessState === 'PASSED' ? 'Verification Passed' : livenessState === 'FAILED' ? 'Verification Failed' : 'Active Liveness Check'}
            </Text>
          </View>
        </View>

        {/* Center Guide Target Frame */}
        <View style={styles.focusFrameContainer}>
          <View style={[styles.focusFrame, { borderColor: getFocusBorderColor() }]} />
        </View>

        {/* Bottom Instruction Panel */}
        <View style={styles.footerPanel}>
          {livenessState === 'FAILED' ? (
            <>
              <Text style={[styles.instructionTitle, { color: '#EF4444' }]}>{instruction.title}</Text>
              <Text style={styles.instructionSubtitle}>{instruction.subtitle}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={resetLiveness}>
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </>
          ) : livenessState === 'PASSED' ? (
            <>
              <Text style={[styles.instructionTitle, { color: '#10B981' }]}>{instruction.title}</Text>
              <Text style={styles.instructionSubtitle}>{instruction.subtitle}</Text>
              <TouchableOpacity style={styles.passedButton} onPress={resetLiveness}>
                <Text style={styles.passedButtonText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.instructionTitle}>{instruction.title}</Text>
              <Text style={styles.instructionSubtitle}>{instruction.subtitle}</Text>

              {/* Progress Steps Indicators */}
              <View style={styles.stepsContainer}>
                <View style={[styles.stepItem, livenessState !== 'WAITING_FOR_FACE' && styles.stepCompleted]}>
                  <Text style={[styles.stepText, livenessState !== 'WAITING_FOR_FACE' && styles.stepTextCompleted]}>Centered</Text>
                </View>
                <View style={[styles.stepItem, (livenessState === 'TURN_LEFT' || livenessState === 'TURN_RIGHT' || livenessState === 'PASSED') && styles.stepCompleted]}>
                  <Text style={[styles.stepText, (livenessState === 'TURN_LEFT' || livenessState === 'TURN_RIGHT' || livenessState === 'PASSED') && styles.stepTextCompleted]}>Blink</Text>
                </View>
                <View style={[styles.stepItem, (livenessState === 'TURN_RIGHT' || livenessState === 'PASSED') && styles.stepCompleted]}>
                  <Text style={[styles.stepText, (livenessState === 'TURN_RIGHT' || livenessState === 'PASSED') && styles.stepTextCompleted]}>Left Turn</Text>
                </View>
                <View style={[styles.stepItem, livenessState === 'PASSED' && styles.stepCompleted]}>
                  <Text style={[styles.stepText, livenessState === 'PASSED' && styles.stepTextCompleted]}>Right Turn</Text>
                </View>
              </View>

              <View style={styles.statusBox}>
                <ActivityIndicator size="small" color="#4B7BFF" style={styles.loader} />
                <Text style={styles.statusText}>Analyzing Active Presence...</Text>
              </View>
            </>
          )}
        </View>
      </View>

      {/* Real-time Telemetry Collapsible Console overlay */}
      <View style={styles.telemetryContainer}>
        <TouchableOpacity style={styles.telemetryToggle} onPress={() => setShowTelemetry(!showTelemetry)}>
          <Text style={styles.telemetryToggleText}>{showTelemetry ? 'Hide Telemetry' : 'Show Telemetry'}</Text>
        </TouchableOpacity>

        {showTelemetry && (
          <View style={styles.telemetryConsole}>
            <Text style={styles.telemetryLine}>FPS: <Text style={styles.telemetryValue}>{fps}</Text></Text>
            <Text style={styles.telemetryLine}>State: <Text style={styles.telemetryValue}>{livenessState}</Text></Text>
            <Text style={styles.telemetryLine}>EAR: <Text style={styles.telemetryValue}>{liveEar.toFixed(3)}</Text></Text>
            <Text style={styles.telemetryLine}>Yaw: <Text style={styles.telemetryValue}>{liveYaw.toFixed(3)}</Text></Text>
            <Text style={styles.telemetryLine}>Turn: <Text style={styles.telemetryValue}>{direction}</Text></Text>
            <Text style={styles.telemetryLine}>Blink Event Sub: <Text style={styles.telemetryValue}>{blinkSubStateRef.current}</Text></Text>
          </View>
        )}
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
    fontSize: 11,
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
  passedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  failedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4B7BFF',
    marginRight: 6,
  },
  passedDot: {
    backgroundColor: '#10B981',
  },
  failedDot: {
    backgroundColor: '#EF4444',
  },
  badgeText: {
    color: '#4B7BFF',
    fontSize: 11,
    fontWeight: '700',
  },
  passedText: {
    color: '#10B981',
  },
  failedText: {
    color: '#EF4444',
  },
  focusFrameContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 20,
  },
  focusFrame: {
    width: 250,
    height: 320,
    borderRadius: 125,
    borderWidth: 2,
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
  retryButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#EF4444',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  passedButton: {
    width: '100%',
    height: 48,
    backgroundColor: '#10B981',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  passedButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  stepsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  stepItem: {
    flex: 1,
    height: 32,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  stepCompleted: {
    backgroundColor: 'rgba(75, 123, 255, 0.15)',
    borderColor: 'rgba(75, 123, 255, 0.4)',
  },
  stepText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5A6071',
  },
  stepTextCompleted: {
    color: '#4B7BFF',
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
  telemetryContainer: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    alignItems: 'flex-end',
  },
  telemetryToggle: {
    backgroundColor: 'rgba(16, 17, 22, 0.9)',
    borderWidth: 1,
    borderColor: '#242736',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  telemetryToggleText: {
    color: '#4B7BFF',
    fontSize: 11,
    fontWeight: '700',
  },
  telemetryConsole: {
    backgroundColor: 'rgba(16, 17, 22, 0.95)',
    borderWidth: 1,
    borderColor: '#242736',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    width: 200,
  },
  telemetryLine: {
    color: '#8A8F9E',
    fontSize: 10,
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  telemetryValue: {
    color: '#00FF66',
    fontWeight: 'bold',
  },
});
