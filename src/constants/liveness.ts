// src/constants/liveness.ts

export const LIVENESS_CONSTANTS = {
  // Eye Aspect Ratio (EAR) threshold for blink detection
  EAR_THRESHOLD: 0.21, // Closed threshold (avgEar must drop below this)
  EAR_OPEN_THRESHOLD: 0.24, // Opened threshold (avgEar must rise above this)

  // Yaw thresholds in degrees for head turn detection (MLKit native yawAngle)
  YAW_LEFT_DEGREE_THRESHOLD: -15, // Degrees (negative value for turning left)
  YAW_RIGHT_DEGREE_THRESHOLD: 15, // Degrees (positive value for turning right)

  // Face recognition model configuration
  RECOGNITION_THRESHOLD: 0.80,
  INFERENCE_THROTTLE_FRAMES: 8, // Run inference every 8 frames

  // Camera settings
  DEFAULT_CAMERA_POSITION: 'front' as const,

  // Landmark Indices (MLKit 16-point eye contours mapping)
  LEFT_EYE_POINTS: [0, 3, 5, 8, 11, 13],
  RIGHT_EYE_POINTS: [0, 3, 5, 8, 11, 13],
  
  // Liveness validation config
  SMOOTHING_WINDOW_SIZE: 5,
  CONSECUTIVE_FRAMES_THRESHOLD: 3, // For head turn confirmation
  STATE_TIMEOUT_MS: 10000, // 10 seconds timeout per state
};
