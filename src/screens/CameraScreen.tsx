import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets, useSharedValue } from 'react-native-worklets-core';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { LIVENESS_CONSTANTS } from '../constants/liveness';
import { calculateEAR } from '../utils/livenessMath';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

type LivenessState =
  | 'WAITING_FOR_FACE'
  | 'FACE_CENTERED'
  | 'BLINK'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'LIVENESS_PASSED'
  | 'LIVENESS_FAILED';

export const CameraScreen: React.FC = () => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(LIVENESS_CONSTANTS.DEFAULT_CAMERA_POSITION);

  // Persistent shared value for frame throttling inside the worklet
  const frameCounter = useSharedValue(0);

  // Initialize third-party MLKit Face Detector plugin with screen-scaled autoMode
  const faceDetector = useFaceDetector(useMemo(() => ({
    performanceMode: 'fast',
    landmarkMode: 'all',
    contourMode: 'all',
    classificationMode: 'all',
    autoMode: true,
    windowWidth: windowWidth,
    windowHeight: windowHeight,
  }), []));

  // Telemetry state variables
  const [faceCount, setFaceCount] = useState(0);
  const [contourCount, setContourCount] = useState(0);
  const [fps, setFps] = useState(0);
  const [liveEar, setLiveEar] = useState(0);
  const [liveYaw, setLiveYaw] = useState(0);
  const [leftOpenProb, setLeftOpenProb] = useState(0);
  const [rightOpenProb, setRightOpenProb] = useState(0);
  const [showTelemetry, setShowTelemetry] = useState(true);

  // Liveness State Machine variables
  const [livenessState, setLivenessState] = useState<LivenessState>('WAITING_FOR_FACE');
  const livenessStateRef = useRef<LivenessState>('WAITING_FOR_FACE');
  const stateStartedTime = useRef<number>(Date.now());
  const consecutiveFramesCount = useRef<number>(0);
  const isEyeClosed = useRef<boolean>(false);
  const earHistory = useRef<number[]>([]);

  // State transition helper
  const transitionToState = useCallback((newState: LivenessState) => {
    livenessStateRef.current = newState;
    setLivenessState(newState);
    stateStartedTime.current = Date.now();
    consecutiveFramesCount.current = 0;
    isEyeClosed.current = false;
    console.log(`[Liveness Machine] Transitioned to state: ${newState}`);
  }, []);

  // Performance timers
  const lastFrameTimeRef = useRef<number>(0);

  // Safe handler callback to update state and log coordinates on JS thread
  const processLandmarks = useCallback((faces: any) => {
    // console.log(`[JS Thread] processLandmarks called. Detected faces: ${faces?.length ?? 0}`);
    
    // 1. Calculate FPS
    const now = Date.now();
    if (lastFrameTimeRef.current > 0) {
      const delta = now - lastFrameTimeRef.current;
      setFps(Math.round(1000 / delta));
    }
    lastFrameTimeRef.current = now;

    // No-face-detected state: reset back to WAITING_FOR_FACE immediately
    if (!faces || faces.length === 0) {
      setFaceCount(0);
      setContourCount(0);
      setLiveEar(0);
      if (
        livenessStateRef.current !== 'WAITING_FOR_FACE' &&
        livenessStateRef.current !== 'LIVENESS_PASSED' &&
        livenessStateRef.current !== 'LIVENESS_FAILED'
      ) {
        console.log('[Liveness Machine] Face lost, resetting to WAITING_FOR_FACE');
        transitionToState('WAITING_FOR_FACE');
      }
      return;
    }

    setFaceCount(faces.length);
    const face = faces[0];
    
    // Set classification probabilities (0.0 to 1.0)
    setLeftOpenProb(face.leftEyeOpenProbability ?? 0);
    setRightOpenProb(face.rightEyeOpenProbability ?? 0);

    // Set raw Yaw Angle
    const yaw = face.yawAngle ?? 0;
    setLiveYaw(yaw);

    const faceCenterX = face.bounds.x + face.bounds.width / 2.0;
    // console.log(`[JS Thread] face.bounds: ${JSON.stringify(face.bounds)} | yaw: ${yaw.toFixed(2)} | faceCenterX: ${faceCenterX.toFixed(2)}`);

    // Process face contours
    const contours = face.contours;
    if (contours) {
      const leftEye = contours.LEFT_EYE;
      const rightEye = contours.RIGHT_EYE;

      if (leftEye && rightEye && leftEye.length >= 14 && rightEye.length >= 14) {
        setContourCount(leftEye.length);

        // 6-point EAR selection based on verified indices: 0, 3, 5, 8, 11, 13
        const leftPoints = [
          leftEye[0], leftEye[3], leftEye[5],
          leftEye[8], leftEye[11], leftEye[13]
        ];
        const rightPoints = [
          rightEye[0], rightEye[3], rightEye[5],
          rightEye[8], rightEye[11], rightEye[13]
        ];

        // MLKit coordinates are absolute pixel values, so we pass 1.0 for scale
        const leftEar = calculateEAR(leftPoints, 1.0, 1.0);
        const rightEar = calculateEAR(rightPoints, 1.0, 1.0);
        const avgEar = (leftEar + rightEar) / 2.0;

        // Apply 5-frame moving average smoothing
        earHistory.current.push(avgEar);
        if (earHistory.current.length > LIVENESS_CONSTANTS.SMOOTHING_WINDOW_SIZE) {
          earHistory.current.shift();
        }
        const smoothedEar = earHistory.current.reduce((a, b) => a + b, 0) / earHistory.current.length;
        setLiveEar(smoothedEar);
        // console.log(`[Liveness Machine] EAR calculated: ${smoothedEar.toFixed(4)} | avgEar: ${avgEar.toFixed(4)} | state: ${livenessStateRef.current} | isEyeClosed: ${isEyeClosed.current}`);

        // Face centering calculation (using screen coordinates from autoMode)
        const faceCenterX = face.bounds.x + face.bounds.width / 2.0;
        const faceCenterY = face.bounds.y + face.bounds.height / 2.0;
        
        // Face is centered if within horizontal margin (90px) and vertical margin (150px) of screen center, and yaw is low
        const isCentered = 
          Math.abs(yaw) < 25.0 && 
          Math.abs(faceCenterX - windowWidth / 2.0) < 90.0 && 
          Math.abs(faceCenterY - windowHeight / 2.0) < 150.0;

        // Active State timeout check
        if (
          livenessStateRef.current !== 'WAITING_FOR_FACE' &&
          livenessStateRef.current !== 'LIVENESS_PASSED' &&
          livenessStateRef.current !== 'LIVENESS_FAILED'
        ) {
          const elapsed = Date.now() - stateStartedTime.current;
          if (elapsed > LIVENESS_CONSTANTS.STATE_TIMEOUT_MS) {
            console.log(`[Liveness Machine] Timeout in state: ${livenessStateRef.current}`);
            transitionToState('LIVENESS_FAILED');
            return;
          }
        }

        // State Machine transitions
        switch (livenessStateRef.current) {
          case 'WAITING_FOR_FACE':
            if (isCentered) {
              consecutiveFramesCount.current += 1;
              if (consecutiveFramesCount.current >= 3) {
                transitionToState('FACE_CENTERED');
              }
            } else {
              consecutiveFramesCount.current = 0;
            }
            break;

          case 'FACE_CENTERED':
            if (isCentered) {
              consecutiveFramesCount.current += 1;
              if (consecutiveFramesCount.current >= 5) {
                transitionToState('BLINK');
              }
            } else {
              transitionToState('WAITING_FOR_FACE');
            }
            break;

          case 'BLINK':
            // 1. Log every frame during BLINK state
            console.log(
              `[Liveness Debug] State: BLINK | avgEar: ${avgEar.toFixed(4)} | smoothedEar: ${smoothedEar.toFixed(4)} | blinkSubState: ${isEyeClosed.current ? 'CLOSED' : 'OPEN'} | Thresholds: closed < ${LIVENESS_CONSTANTS.EAR_THRESHOLD.toFixed(2)}, open > ${LIVENESS_CONSTANTS.EAR_OPEN_THRESHOLD.toFixed(2)}`
            );

            // Blink event: eyes closed -> eyes opened
            if (!isEyeClosed.current && avgEar < LIVENESS_CONSTANTS.EAR_THRESHOLD) {
              isEyeClosed.current = true;
              console.log(`[Liveness Debug] Transition OPEN -> CLOSED | avgEar: ${avgEar.toFixed(4)} | threshold: ${LIVENESS_CONSTANTS.EAR_THRESHOLD}`);
              console.log('[Liveness Machine] Eyes closed');
            } else if (isEyeClosed.current && avgEar > LIVENESS_CONSTANTS.EAR_OPEN_THRESHOLD) {
              isEyeClosed.current = false;
              console.log(`[Liveness Debug] Transition CLOSED -> OPEN | avgEar: ${avgEar.toFixed(4)} | threshold: ${LIVENESS_CONSTANTS.EAR_OPEN_THRESHOLD}`);
              console.log('[Liveness Debug] Blink detected! Transitioning to TURN_LEFT');
              console.log('[Liveness Machine] Eyes opened - Blink confirmed!');
              transitionToState('TURN_LEFT');
            }
            break;

          case 'TURN_LEFT':
            if (yaw < LIVENESS_CONSTANTS.YAW_LEFT_DEGREE_THRESHOLD) {
              consecutiveFramesCount.current += 1;
              if (consecutiveFramesCount.current >= LIVENESS_CONSTANTS.CONSECUTIVE_FRAMES_THRESHOLD) {
                transitionToState('TURN_RIGHT');
              }
            } else {
              consecutiveFramesCount.current = 0;
            }
            break;

          case 'TURN_RIGHT':
            if (yaw > LIVENESS_CONSTANTS.YAW_RIGHT_DEGREE_THRESHOLD) {
              consecutiveFramesCount.current += 1;
              if (consecutiveFramesCount.current >= LIVENESS_CONSTANTS.CONSECUTIVE_FRAMES_THRESHOLD) {
                transitionToState('LIVENESS_PASSED');
              }
            } else {
              consecutiveFramesCount.current = 0;
            }
            break;

          default:
            break;
        }
      }
    }
  }, [transitionToState]);

  // Safely bridge callback into isolated frame processor worklet thread
  const onFaceDetected = useRef(Worklets.createRunOnJS(processLandmarks)).current;

  // Frame processor execution logic
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    
    // Throttle: process once every 3 frames (approx. 10 FPS)
    frameCounter.value = (frameCounter.value + 1) % 3;
    // console.log('[Worklet Thread] Frame received, counter:', frameCounter.value);
    if (frameCounter.value !== 0) return;

    // console.log('[Worklet Thread] Executing face detection...');
    const faces = faceDetector.detectFaces(frame);
    // console.log('[Worklet Thread] Face detection result count:', faces.length);
    onFaceDetected(faces);
  }, [faceDetector, onFaceDetected, frameCounter]);

  // Request permissions on mount
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

  const getInstructionMessage = (state: LivenessState) => {
    switch (state) {
      case 'WAITING_FOR_FACE':
        return 'Align your face inside the target frame';
      case 'FACE_CENTERED':
        return 'Face centered. Hold still...';
      case 'BLINK':
        return 'Please BLINK your eyes once';
      case 'TURN_LEFT':
        return 'Now, slowly TURN your head LEFT';
      case 'TURN_RIGHT':
        return 'Now, slowly TURN your head RIGHT';
      case 'LIVENESS_PASSED':
        return 'Identity verified! Liveness check passed.';
      case 'LIVENESS_FAILED':
        return 'Verification timed out. Please try again.';
      default:
        return 'Preparing camera stream...';
    }
  };

  const getStatusLabel = () => {
    switch (livenessState) {
      case 'WAITING_FOR_FACE':
        return 'Awaiting face detection...';
      case 'FACE_CENTERED':
        return 'Locking face coordinates...';
      case 'BLINK':
        return 'Waiting for blink event...';
      case 'TURN_LEFT':
        return 'Waiting for left head turn...';
      case 'TURN_RIGHT':
        return 'Waiting for right head turn...';
      case 'LIVENESS_PASSED':
        return 'Liveness Verified';
      case 'LIVENESS_FAILED':
        return 'Check failed due to timeout';
      default:
        return 'Active';
    }
  };

  const getFrameColor = () => {
    switch (livenessState) {
      case 'LIVENESS_PASSED':
        return '#00FF66'; // Green
      case 'LIVENESS_FAILED':
        return '#FF3366'; // Red
      case 'WAITING_FOR_FACE':
        return '#8A8F9E'; // Gray
      case 'FACE_CENTERED':
        return '#FFCC00'; // Yellow
      default:
        return '#4B7BFF'; // Blue
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live Camera Preview with Frame Processor */}
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={livenessState !== 'LIVENESS_PASSED'} // Pause camera on success
        enableNativeZoomGesture={false}
        frameProcessor={frameProcessor}
      />

      {/* Modern UI Overlays */}
      <View style={styles.overlayContainer}>
        {/* Top Header Card */}
        <View style={styles.headerCard}>
          <Text style={styles.headerText}>OFFLINE FACIAL AUTHENTICATION</Text>
          <View style={[styles.badge, { backgroundColor: livenessState === 'LIVENESS_PASSED' ? 'rgba(0, 255, 102, 0.15)' : 'rgba(75, 123, 255, 0.15)' }]}>
            <View style={[styles.dot, { backgroundColor: getFrameColor() }]} />
            <Text style={[styles.badgeText, { color: getFrameColor() }]}>
              {livenessState === 'LIVENESS_PASSED' ? 'LIVENESS OK' : 'ACTIVE LIVENESS'}
            </Text>
          </View>
        </View>

        {/* Center Guide Target Frame */}
        <View style={styles.focusFrameContainer}>
          <View style={[styles.focusFrame, { borderColor: getFrameColor() }]} />
        </View>

        {/* Bottom Instruction Panel */}
        <View style={styles.footerPanel}>
          <Text style={styles.instructionTitle}>
            {livenessState === 'LIVENESS_PASSED' ? 'Verification Passed!' : 
             livenessState === 'LIVENESS_FAILED' ? 'Verification Failed' : 'Active Liveness Check'}
          </Text>
          <Text style={[
            styles.instructionSubtitle, 
            { color: livenessState === 'LIVENESS_PASSED' ? '#00FF66' : livenessState === 'LIVENESS_FAILED' ? '#FF3366' : '#8A8F9E' }
          ]}>
            {getInstructionMessage(livenessState)}
          </Text>
          
          {livenessState === 'LIVENESS_FAILED' ? (
            <TouchableOpacity 
              style={[styles.button, { marginTop: 10, backgroundColor: '#FF3366' }]} 
              onPress={() => transitionToState('WAITING_FOR_FACE')}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.statusBox}>
              {livenessState !== 'LIVENESS_PASSED' && livenessState !== 'LIVENESS_FAILED' && (
                <ActivityIndicator size="small" color={getFrameColor()} style={styles.loader} />
              )}
              <Text style={[styles.statusText, { color: getFrameColor() }]}>
                {getStatusLabel()}
              </Text>
            </View>
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
            <Text style={styles.telemetryLine}>State: <Text style={[styles.telemetryValue, { color: getFrameColor() }]}>{livenessState}</Text></Text>
            <Text style={styles.telemetryLine}>FPS: <Text style={styles.telemetryValue}>{fps}</Text></Text>
            <Text style={styles.telemetryLine}>Faces: <Text style={styles.telemetryValue}>{faceCount}</Text></Text>
            <Text style={styles.telemetryLine}>Yaw: <Text style={styles.telemetryValue}>{liveYaw.toFixed(1)}°</Text></Text>
            <Text style={styles.telemetryLine}>Smoothed EAR: <Text style={styles.telemetryValue}>{liveEar.toFixed(3)}</Text></Text>
            <Text style={styles.telemetryLine}>Left Eye Prob: <Text style={styles.telemetryValue}>{leftOpenProb.toFixed(3)}</Text></Text>
            <Text style={styles.telemetryLine}>Right Eye Prob: <Text style={styles.telemetryValue}>{rightOpenProb.toFixed(3)}</Text></Text>
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
    width: 210,
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
