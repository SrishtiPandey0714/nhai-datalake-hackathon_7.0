// src/constants/liveness.ts

export const LIVENESS_CONSTANTS = {
  // Eye Aspect Ratio (EAR) threshold for blink detection
  EAR_THRESHOLD: 0.22,

  // Yaw thresholds for head turn detection (nose tip distance ratio)
  YAW_LEFT_THRESHOLD: 0.5,
  YAW_RIGHT_THRESHOLD: 2.0,

  // Face recognition model configuration
  RECOGNITION_THRESHOLD: 0.80,
  INFERENCE_THROTTLE_FRAMES: 8, // Run inference every 8 frames

  // Camera settings
  DEFAULT_CAMERA_POSITION: 'front' as const,

  // Landmark Indices (MediaPipe Face Mesh 468 landmarks mapping)
  LEFT_EYE_POINTS: [33, 160, 158, 133, 153, 144],
  RIGHT_EYE_POINTS: [362, 385, 387, 263, 373, 380],
  NOSE_TIP_POINT: 1,
  LEFT_FACE_EDGE_POINT: 234,
  RIGHT_FACE_EDGE_POINT: 454,

  // Liveness validation config
  SMOOTHING_WINDOW_SIZE: 5,
  CONSECUTIVE_FRAMES_THRESHOLD: 3, // For head turn confirmation
  STATE_TIMEOUT_MS: 10000, // 10 seconds timeout per state
};

