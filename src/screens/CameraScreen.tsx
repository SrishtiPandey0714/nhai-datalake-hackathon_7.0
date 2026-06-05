// src/screens/CameraScreen.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useFrameProcessor } from 'react-native-vision-camera';
import { Worklets, useSharedValue } from 'react-native-worklets-core';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { LIVENESS_CONSTANTS } from '../constants/liveness';
import { calculateEAR } from '../utils/livenessMath';
import { EnrollmentSession } from '../services/enrollmentService';
import { generateEmbedding, EMBEDDING_CONFIG } from '../services/embeddingProvider';
import { getEmployeeById, logAttendance } from '../services/database';
import { calculateCosineSimilarity } from '../utils/embeddingUtils';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

type LivenessState =
  | 'WAITING_FOR_FACE'
  | 'FACE_CENTERED'
  | 'BLINK'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'LIVENESS_PASSED'
  | 'UNKNOWN_FACE'
  | 'LIVENESS_FAILED';

export interface CameraScreenProps {
  mode?: 'enrollment' | 'verification';
  employeeId?: string;
  name?: string;
  onClose?: () => void;
  onEnrollSuccess?: () => void;
}

export const CameraScreen: React.FC<CameraScreenProps> = ({
  mode = 'verification',
  employeeId,
  name,
  onClose,
  onEnrollSuccess,
}) => {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(LIVENESS_CONSTANTS.DEFAULT_CAMERA_POSITION);

  // Load the quantized EfficientNet TFLite model on mount
  const delegateType = Platform.OS === 'ios' ? 'core-ml' : 'nnapi';
  
  const modelSource = useMemo(() => {
    return Platform.OS === 'android'
      ? { url: 'efficientnet_quantized_512' }
      : require('../../assets/models/efficientnet_quantized_512.tflite');
  }, []);

  const plugin = useTensorflowModel(modelSource, delegateType);
  const model = plugin.model;

  // Add temporary logging for model verification
  useEffect(() => {
    console.log(`[TFLite Loading] Model state updated: ${plugin.state}`);
    if (plugin.state === 'loading') {
      console.log('[TFLite Loading] Loading TFLite model...');
    } else if (plugin.state === 'loaded' && plugin.model) {
      console.log('[TFLite Loading] Model loaded successfully');
      plugin.model.inputs.forEach((input, index) => {
        console.log(`[TFLite Loading] Input Tensor #${index}: Name="${input.name}", Shape=[${input.shape.join(',')}], DataType="${input.dataType}"`);
      });
      plugin.model.outputs.forEach((output, index) => {
        console.log(`[TFLite Loading] Output Tensor #${index}: Name="${output.name}", Shape=[${output.shape.join(',')}], DataType="${output.dataType}"`);
      });
    } else if (plugin.state === 'error') {
      console.error('[TFLite Loading] Failed to load model:', plugin.error);
    }
  }, [plugin]);

  // Persistent shared value for frame throttling inside the worklet
  const recognitionFrameCounter = useSharedValue(0);
  const isLivenessPassedShared = useSharedValue(false);
  const isEnrollmentModeShared = useSharedValue(mode === 'enrollment');
  const employeeIdShared = useSharedValue(employeeId || '');

  // Synchronize the mode value with the worklet thread
  useEffect(() => {
    isEnrollmentModeShared.value = mode === 'enrollment';
  }, [mode, isEnrollmentModeShared]);

  useEffect(() => {
    employeeIdShared.value = employeeId || '';
  }, [employeeId, employeeIdShared]);

  // Lifecycle-safe initialization of EnrollmentSession inside the component
  const enrollmentSessionRef = useRef<EnrollmentSession | null>(null);
  const [capturedCount, setCapturedCount] = useState(0);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [enrollmentSuccess, setEnrollmentSuccess] = useState(false);
  const lastCaptureTimeRef = useRef<number>(0);

  useEffect(() => {
    if (mode === 'enrollment' && employeeId && name) {
      enrollmentSessionRef.current = new EnrollmentSession(employeeId, name);
      setCapturedCount(0);
      setEnrollmentError(null);
      setEnrollmentSuccess(false);
    } else {
      enrollmentSessionRef.current = null;
    }
  }, [mode, employeeId, name]);

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

  // Biometrics and Recognition states
  const [recognizedName, setRecognizedName] = useState<string | null>(null);
  const [confidenceScore, setConfidenceScore] = useState<number>(0);
  const [inferenceTime, setInferenceTime] = useState<number>(0);
  const [embeddingSource, setEmbeddingSource] = useState<string>('MOCK');

  // Liveness State Machine variables
  const [livenessState, setLivenessState] = useState<LivenessState>('WAITING_FOR_FACE');
  const livenessStateRef = useRef<LivenessState>('WAITING_FOR_FACE');
  const stateStartedTime = useRef<number>(Date.now());
  const consecutiveFramesCount = useRef<number>(0);
  const isEyeClosed = useRef<boolean>(false);
  const earHistory = useRef<number[]>([]);

  // Verification history refs
  const lastMatchedIndex = useRef<number>(-1);
  const consecutiveMatches = useRef<number>(0);
  const predictionHistory = useRef<{ index: number; confidence: number }[]>([]);

  // State transition helper
  const transitionToState = useCallback((newState: LivenessState) => {
    livenessStateRef.current = newState;
    setLivenessState(newState);
    stateStartedTime.current = Date.now();
    consecutiveFramesCount.current = 0;
    isEyeClosed.current = false;

    // Notify frame processor worklet if active scanning is enabled
    isLivenessPassedShared.value = (newState === 'LIVENESS_PASSED' || newState === 'UNKNOWN_FACE');

    console.log(`[Liveness Machine] Transitioned to state: ${newState}`);
  }, [isLivenessPassedShared]);

  // Performance timers
  const lastFrameTimeRef = useRef<number>(0);

  // Safe handler callback to update state and log coordinates on JS thread
  const processLandmarks = useCallback((faces: any, biometricsResult?: any) => {
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
      
      const currentState = livenessStateRef.current;
      const isScanning = (currentState === 'LIVENESS_PASSED' && !recognizedName) || currentState === 'UNKNOWN_FACE';
      const isLivenessActive = currentState !== 'WAITING_FOR_FACE' && currentState !== 'LIVENESS_FAILED' && (currentState !== 'LIVENESS_PASSED' || isScanning);

      if (isLivenessActive) {
        console.log('[Liveness Machine] Face lost, resetting to WAITING_FOR_FACE');
        
        // Reset biometrics verification history
        consecutiveMatches.current = 0;
        lastMatchedIndex.current = -1;
        predictionHistory.current = [];
        
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
          livenessStateRef.current !== 'UNKNOWN_FACE' &&
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
            if (isCentered && model) {
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
            // Blink event: eyes closed -> eyes opened
            if (!isEyeClosed.current && avgEar < LIVENESS_CONSTANTS.EAR_THRESHOLD) {
              isEyeClosed.current = true;
              console.log('[Liveness Machine] Eyes closed');
            } else if (isEyeClosed.current && avgEar > LIVENESS_CONSTANTS.EAR_OPEN_THRESHOLD) {
              isEyeClosed.current = false;
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

        // Biometric Face Recognition / Enrollment processing
        if (biometricsResult && (livenessStateRef.current === 'LIVENESS_PASSED' || livenessStateRef.current === 'UNKNOWN_FACE')) {
          if (biometricsResult.embeddingSource) {
            setEmbeddingSource(biometricsResult.embeddingSource);
          }

          if (mode === 'enrollment') {
            if (biometricsResult.qualityError) {
              setEnrollmentError(biometricsResult.qualityError);
              return;
            }

            if (biometricsResult.embedding) {
              const currentTime = Date.now();
              // Enforce 500ms capture spacing between enrollment samples
              if (currentTime - lastCaptureTimeRef.current >= 500) {
                if (enrollmentSessionRef.current) {
                  const floatArray = new Float32Array(biometricsResult.embedding);
                  const result = enrollmentSessionRef.current.addEmbedding(floatArray);

                  if (result.status === 'collecting') {
                    setCapturedCount(result.count);
                    setEnrollmentError(null);
                  } else if (result.status === 'quality_rejected') {
                    setEnrollmentError(result.error || 'Face is too static');
                  } else if (result.status === 'complete') {
                    setCapturedCount(5);
                    setEnrollmentSuccess(true);
                    setEnrollmentError(null);
                    console.log('[CameraScreen] Enrollment complete');
                    
                    setTimeout(() => {
                      if (onEnrollSuccess) onEnrollSuccess();
                    }, 2000);
                  } else if (result.status === 'error') {
                    setEnrollmentError(result.error || 'Registration failed');
                  }
                }
                lastCaptureTimeRef.current = currentTime;
              }
            }
            return;
          }

          // Verification Mode - match against stored template using cosine similarity
          const empRecord = employeeId ? getEmployeeById(employeeId) : null;
          if (empRecord && biometricsResult.embedding) {
            const currentEmbedding = new Float32Array(biometricsResult.embedding);
            const templateEmbedding = empRecord.embedding;
            const similarity = calculateCosineSimilarity(currentEmbedding, templateEmbedding);
            
            setInferenceTime(biometricsResult.inferenceTime ?? 0);
            setConfidenceScore(similarity);
            
            if (similarity >= 0.80) {
              setRecognizedName(empRecord.name);
              // Log attendance to local SQLite logs
              try {
                logAttendance(employeeId!, 'PRESENT');
                console.log(`[CameraScreen] Attendance recorded for ${employeeId} (${empRecord.name})`);
              } catch (dbErr) {
                console.error('[CameraScreen] Failed to record attendance:', dbErr);
              }
              
              // Automatically return to HomeScreen after successful verification
              // A 2-second timeout allows the user to see the PASS telemetry badge
              setTimeout(() => {
                if (onClose) onClose();
              }, 2000);
            } else {
              setRecognizedName("Access Denied");
            }
          } else {
            setRecognizedName("Verification Error: Record Not Found");
          }
        }
      }
    }
  }, [transitionToState, model, mode, onEnrollSuccess, recognizedName]);

  // Safely bridge callback into isolated frame processor worklet thread
  const onFaceDetected = useRef(Worklets.createRunOnJS(processLandmarks)).current;

  // Frame processor execution logic
  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';

    const faces = faceDetector.detectFaces(frame);
    let biometricsResult = null;
    
    if (isLivenessPassedShared.value && faces.length > 0 && model) {
      // Run recognition inference only on every 5th processed frame (approx. 6 FPS)
      recognitionFrameCounter.value = (recognitionFrameCounter.value + 1) % 5;
      if (recognitionFrameCounter.value === 0) {
        const face = faces[0];
        
        let isQualityValid = true;
        let qualityError = '';
        
        // 1. Perform face quality check BEFORE model inference in Enrollment Mode
        if (isEnrollmentModeShared.value) {
          const yaw = face.yawAngle ?? 0;
          const faceCenterX = face.bounds.x + face.bounds.width / 2.0;
          const faceCenterY = face.bounds.y + face.bounds.height / 2.0;
          
          if (Math.abs(yaw) > 10.0) {
            isQualityValid = false;
            qualityError = 'Keep head straight (Yaw: ' + yaw.toFixed(1) + '°)';
          } else if (Math.abs(faceCenterX - windowWidth / 2.0) > 60.0) {
            isQualityValid = false;
            qualityError = 'Center your face horizontally';
          } else if (Math.abs(faceCenterY - windowHeight / 2.0) > 100.0) {
            isQualityValid = false;
            qualityError = 'Center your face vertically';
          }
        }
        
        if (isQualityValid) {
          // Map face bounding box from scaled screen coordinates back to raw frame coordinates
          const cropX = Math.max(0, Math.round(face.bounds.x * (frame.width / windowWidth)));
          const cropY = Math.max(0, Math.round(face.bounds.y * (frame.height / windowHeight)));
          const cropW = Math.min(Math.round(face.bounds.width * (frame.width / windowWidth)), frame.width - cropX);
          const cropH = Math.min(Math.round(face.bounds.height * (frame.height / windowHeight)), frame.height - cropY);
          
          if (cropW > 0 && cropH > 0) {
            // Get the raw RGB frame pixel buffer
            const frameData = new Uint8Array(frame.toArrayBuffer());
            
            // Crop and resize region to exactly 224x224 RGB
            const targetSize = 224;
            const resized = new Uint8Array(targetSize * targetSize * 3);
            
            for (let dy = 0; dy < targetSize; dy++) {
              for (let dx = 0; dx < targetSize; dx++) {
                const srcX = cropX + (dx / targetSize) * cropW;
                const srcY = cropY + (dy / targetSize) * cropH;
                
                const sx = Math.min(Math.max(Math.round(srcX), 0), frame.width - 1);
                const sy = Math.min(Math.max(Math.round(srcY), 0), frame.height - 1);
                
                const srcIdx = (sy * frame.width + sx) * 3;
                const dstIdx = (dy * targetSize + dx) * 3;
                
                resized[dstIdx] = frameData[srcIdx];
                resized[dstIdx + 1] = frameData[srcIdx + 1];
                resized[dstIdx + 2] = frameData[srcIdx + 2];
              }
            }
            
            // Run TFLite inference directly on the Worklet thread and measure latency
            const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
            
            // Generate embedding using the abstraction provider layer
            const embeddingMode = EMBEDDING_CONFIG.mode;
            const embedding = generateEmbedding(embeddingMode, model, resized, employeeIdShared.value);
            
            const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
            const latency = end - start;
            
            biometricsResult = {
              embedding: embedding,
              inferenceTime: latency,
              embeddingSource: embeddingMode
            };
          }
        } else {
          // Pass quality error back to update HUD
          biometricsResult = {
            qualityError: qualityError
          };
        }
      }
    }
    
    onFaceDetected(faces, biometricsResult);
  }, [faceDetector, onFaceDetected, model, isLivenessPassedShared, recognitionFrameCounter, isEnrollmentModeShared]);

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
    if (mode === 'enrollment' && state === 'LIVENESS_PASSED') {
      if (enrollmentSuccess) {
        return `Registration Successful for ${name}!`;
      }
      if (enrollmentError) {
        return enrollmentError;
      }
      return `Capturing templates: ${capturedCount} of 5. Move your head slightly.`;
    }

    if (mode === 'verification' && state === 'LIVENESS_PASSED') {
      if (recognizedName === "Access Denied") {
        return `Access Denied\nSimilarity: ${confidenceScore.toFixed(3)}  |  Threshold: 0.800\nResult: FAIL`;
      }
      if (recognizedName && !recognizedName.startsWith("Liveness Passed") && !recognizedName.startsWith("Verification Error")) {
        return `Welcome, ${recognizedName}!\nSimilarity: ${confidenceScore.toFixed(3)}  |  Threshold: 0.800\nResult: PASS`;
      }
      return 'Liveness Passed. Scanning Identity...';
    }

    switch (state) {
      case 'WAITING_FOR_FACE':
        return model ? 'Align your face inside the target frame' : 'Booting up AI Engine...';
      case 'FACE_CENTERED':
        return 'Face centered. Hold still...';
      case 'BLINK':
        return 'Please BLINK your eyes once';
      case 'TURN_LEFT':
        return 'Now, slowly TURN your head LEFT';
      case 'TURN_RIGHT':
        return 'Now, slowly TURN your head RIGHT';
      case 'LIVENESS_PASSED':
        return recognizedName 
          ? `Welcome, ${recognizedName}! Identity Verified.` 
          : 'Liveness Passed. Scanning Identity...';
      case 'UNKNOWN_FACE':
        return 'Unknown face detected. Continuing scanning...';
      case 'LIVENESS_FAILED':
        return 'Verification timed out. Please try again.';
      default:
        return 'Preparing camera stream...';
    }
  };

  const getStatusLabel = () => {
    if (mode === 'enrollment' && livenessState === 'LIVENESS_PASSED') {
      return enrollmentSuccess ? 'Enrollment Complete' : `Template Capture: ${capturedCount}/5`;
    }

    switch (livenessState) {
      case 'WAITING_FOR_FACE':
        return model ? 'Awaiting face detection...' : 'Loading Biometrics Engine...';
      case 'FACE_CENTERED':
        return 'Locking face coordinates...';
      case 'BLINK':
        return 'Waiting for blink event...';
      case 'TURN_LEFT':
        return 'Waiting for left head turn...';
      case 'TURN_RIGHT':
        return 'Waiting for right head turn...';
      case 'LIVENESS_PASSED':
        if (mode === 'verification') {
          if (recognizedName === "Access Denied") return 'Access Denied';
          if (recognizedName && !recognizedName.startsWith("Liveness Passed")) return 'Access Granted';
        }
        return recognizedName ? 'Access Granted' : 'Scanning Biometrics...';
      case 'UNKNOWN_FACE':
        return 'Unknown Face - Continue Scanning';
      case 'LIVENESS_FAILED':
        return 'Check failed due to timeout';
      default:
        return 'Active';
    }
  };

  const getFrameColor = () => {
    if (mode === 'enrollment' && livenessState === 'LIVENESS_PASSED') {
      return enrollmentSuccess ? '#00FF66' : enrollmentError ? '#FF8800' : '#4B7BFF';
    }

    switch (livenessState) {
      case 'LIVENESS_PASSED':
        return recognizedName ? '#00FF66' : '#4B7BFF';
      case 'LIVENESS_FAILED':
        return '#FF3366';
      case 'WAITING_FOR_FACE':
        return '#8A8F9E';
      case 'FACE_CENTERED':
        return '#FFCC00';
      case 'UNKNOWN_FACE':
        return '#FF8800';
      default:
        return '#4B7BFF';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Live Camera Preview with Frame Processor */}
      <Camera
        style={StyleSheet.absoluteFillObject}
        device={device}
        isActive={!enrollmentSuccess && !recognizedName} // Pause camera on success
        enableZoomGesture={false}
        frameProcessor={frameProcessor}
        pixelFormat="rgb" // EfficientNet requires standard RGB colors
      />

      {/* Modern UI Overlays */}
      <View style={styles.overlayContainer}>
        {/* Top Header Card */}
        <View style={styles.headerCard}>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕ Cancel</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.headerText}>OFFLINE FACIAL AUTHENTICATION</Text>
          <View style={[styles.badge, { backgroundColor: recognizedName || enrollmentSuccess ? 'rgba(0, 255, 102, 0.15)' : 'rgba(75, 123, 255, 0.15)' }]}>
            <View style={[styles.dot, { backgroundColor: getFrameColor() }]} />
            <Text style={[styles.badgeText, { color: getFrameColor() }]}>
              {mode === 'enrollment' ? 'BIOMETRIC ENROLLMENT' : 'ACTIVE LIVENESS'}
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
            {enrollmentSuccess || recognizedName ? 'Verification Passed!' : 
             livenessState === 'LIVENESS_FAILED' ? 'Verification Failed' : 'Active Liveness Check'}
          </Text>
          <Text style={[
            styles.instructionSubtitle, 
            { color: enrollmentSuccess || recognizedName ? '#00FF66' : livenessState === 'LIVENESS_FAILED' ? '#FF3366' : '#8A8F9E' }
          ]}>
            {getInstructionMessage(livenessState)}
          </Text>
          
          {livenessState === 'LIVENESS_FAILED' ? (
            <TouchableOpacity 
              style={[styles.button, { marginTop: 10, backgroundColor: '#FF3366' }]} 
              onPress={() => {
                consecutiveMatches.current = 0;
                lastMatchedIndex.current = -1;
                predictionHistory.current = [];
                if (enrollmentSessionRef.current) {
                  enrollmentSessionRef.current.reset();
                  setCapturedCount(0);
                  setEnrollmentError(null);
                  setEnrollmentSuccess(false);
                }
                transitionToState('WAITING_FOR_FACE');
              }}
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          ) : enrollmentSuccess ? (
            <ActivityIndicator size="small" color="#00FF66" style={{ marginTop: 10 }} />
          ) : recognizedName ? (
            <TouchableOpacity 
              style={[styles.button, { marginTop: 10, backgroundColor: '#00FF66' }]} 
              onPress={() => {
                setRecognizedName(null);
                setConfidenceScore(0);
                setInferenceTime(0);
                consecutiveMatches.current = 0;
                lastMatchedIndex.current = -1;
                predictionHistory.current = [];
                transitionToState('WAITING_FOR_FACE');
              }}
            >
              <Text style={[styles.buttonText, { color: '#000000' }]}>Restart Scan</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.statusBox}>
              {((livenessState !== 'LIVENESS_PASSED' || (!recognizedName && !enrollmentSuccess))) && (
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
            <Text style={styles.telemetryLine}>Contours: <Text style={styles.telemetryValue}>{contourCount}</Text></Text>
            <Text style={styles.telemetryLine}>Yaw: <Text style={styles.telemetryValue}>{liveYaw.toFixed(1)}°</Text></Text>
            <Text style={styles.telemetryLine}>L/R Eye Open: <Text style={styles.telemetryValue}>{(leftOpenProb * 100).toFixed(0)}% / {(rightOpenProb * 100).toFixed(0)}%</Text></Text>
            <Text style={styles.telemetryLine}>Smoothed EAR: <Text style={styles.telemetryValue}>{liveEar.toFixed(3)}</Text></Text>
            
            {/* TFLite Biometrics telemetry */}
            {embeddingSource === 'MOCK' && (
              <Text style={styles.telemetryLine}>Mode: <Text style={[styles.telemetryValue, { color: '#FFCC00' }]}>DEMO MODE</Text></Text>
            )}
            <Text style={styles.telemetryLine}>Embedding Source: <Text style={styles.telemetryValue}>{embeddingSource}</Text></Text>
            <Text style={styles.telemetryLine}>Model Target: <Text style={styles.telemetryValue}>{mode === 'enrollment' ? 'Enrollment Mode' : recognizedName || 'N/A'}</Text></Text>
            <Text style={styles.telemetryLine}>Inference: <Text style={styles.telemetryValue}>{inferenceTime.toFixed(1)}ms</Text></Text>
            {mode === 'verification' && (
              <>
                <Text style={styles.telemetryLine}>Similarity: <Text style={styles.telemetryValue}>{confidenceScore.toFixed(3)}</Text></Text>
                <Text style={styles.telemetryLine}>Threshold: <Text style={styles.telemetryValue}>0.800</Text></Text>
                <Text style={styles.telemetryLine}>Result: <Text style={[styles.telemetryValue, { color: confidenceScore >= 0.80 ? '#00FF66' : '#FF3366' }]}>{confidenceScore >= 0.80 ? 'PASS' : 'FAIL'}</Text></Text>
              </>
            )}
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
  closeButton: {
    position: 'absolute',
    left: 16,
    top: 14,
    padding: 6,
    zIndex: 10,
  },
  closeButtonText: {
    color: '#FF3366',
    fontSize: 13,
    fontWeight: '700',
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
