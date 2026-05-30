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
};
