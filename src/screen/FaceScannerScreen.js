/**
 * ============================================================================
 * 🚨 HEY SHASHWAT - READ THIS FIRST! (From Srishti & Tech Lead) 🚨
 * ============================================================================
 * * WHY THIS FILE BELONGS IN YOUR BRANCH (FRONTEND):
 * This is the master UI screen for the Face Recognition step. It handles 
 * opening the camera, feeding the video frames into the AI chip, and 
 * displaying the recognized name on the screen. Because it uses React Native 
 * UI components, it needs to live in your frontend app!
 * * * WHAT IS NEW (THE LIVENESS GATE):
 * We have added the MediaPipe Face Detector plugin. The camera will now 
 * demand that the user physically BLINKS (Liveness) before it allows the 
 * heavy EfficientNet model to run. This prevents spoofing with printed photos!
 * * * FOLDER STRUCTURE & PATHS:
 * Place this file specifically in your `src/screens/` folder. 
 * I have already configured the paths below assuming your folder tree looks like this:
 * * your-app/
 * ├── assets/
 * │   ├── models/
 * │   │   └── efficientnet_quantized.tflite  <-- (The AI model)
 * │   └── labels.json                        <-- (The actor dictionary)
 * ├── src/
 * │   ├── screens/
 * │   │   └── FaceScannerScreen.js           <-- (THIS FILE GOES HERE)
 * │   ├── utils/
 * │       └── livenessMath.js                <-- (Srishti's math engine)
 * ============================================================================
 */

import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor, runAsync } from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector'; // <-- NEW: Face Detector Plugin
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useSharedValue } from 'react-native-reanimated';

// 1. IMPORT SRISHTI'S MATH ENGINE
import { calculateEAR } from '../utils/livenessMath';
// Imports the dictionary mapping 0-99 to Actor Names.
import labels from '../../assets/labels.json';

export function FaceRecognitionCamera() {
    // 1. TURN ON THE CAMERA & PLUGINS
    // Grabs the front-facing selfie camera
    const device = useCameraDevice('front');
    // Initializes the lightweight MediaPipe face detector to grab facial landmarks
    const faceDetector = useFaceDetector({ landmarkMode: 'all' });

    // 2. CONFIGURE THE HARDWARE "BRAIN"
    // Uses Apple Neural Engine on iOS or Android Neural Networks API on Android.
    // This prevents battery drain and makes the AI run instantly.
    const delegateType = Platform.OS === 'ios' ? 'core-ml' : 'nnapi';

    // 3. LOAD THE AI MODEL
    // Loads our compressed model from the assets/models folder.
    const plugin = useTensorflowModel(
        require('../../assets/models/efficientnet_quantized.tflite'), // <-- revised exact filename
        delegateType
    );
    const model = plugin.model;

    // 4. SET UP UI BRIDGES (Shared Values)
    // "Shared Values" act as a bridge to send data safely from the fast background camera thread to the UI screen.
    const currentPrediction = useSharedValue('Prove you are real: Please blink.'); // Changed to prompt a blink
    const confidenceScore = useSharedValue(0);
    const hasPassedLiveness = useSharedValue(false); // NEW: The Liveness Gate state tracker

    // 5. THE CAMERA FRAME PROCESSOR (The Engine)
    const frameProcessor = useFrameProcessor((frame) => {
        'worklet'; // Runs this heavy math on the ultra-fast native thread

        // STEP A: EXTRACT LANDMARKS (Runs at 30 FPS on the main camera thread)
        const faces = faceDetector.detectFaces(frame);

        if (faces.length > 0) {
            const face = faces[0];
            const landmarks = face.landmarks;
            const width = frame.width;
            const height = frame.height;

            // STEP B: CHECK LIVENESS (The Gatekeeper)
            // If the user hasn't blinked yet, run Srishti's math.
            if (!hasPassedLiveness.value) {
                // Grab the specific 6 points needed for the Left Eye calculation
                const leftEyePoints = [
                    landmarks.leftEye.left, landmarks.leftEye.top,
                    landmarks.leftEye.top, landmarks.leftEye.right,
                    landmarks.leftEye.bottom, landmarks.leftEye.bottom
                ];

                // Calculate Eye Aspect Ratio using Srishti's imported function
                const ear = calculateEAR(leftEyePoints, width, height);

                // If EAR drops below 0.22, they blinked! Open the gate.
                if (ear < 0.22) {
                    hasPassedLiveness.value = true;
                    currentPrediction.value = "Liveness Confirmed. Scanning Identity...";
                }

                return; // STOP HERE. Do not run EfficientNet until they pass liveness.
            }

            // STEP C: RUN SECURE BIOMETRICS (Only runs AFTER liveness is passed)
            // runAsync ensures our AI math doesn't block the camera preview.
            runAsync(frame, () => {
                // If the model hasn't finished loading into memory yet, do nothing.
                if (!model) return;

                // 1. Prepare the Image
                // Converts the camera frame into a raw data buffer. 
                // Ensure your camera configuration resizes this to 224x224 RGB!
                const inputData = frame.toArrayBuffer();

                // 2. Run the AI
                // Feeds the image to the model, returning an array of 100 probabilities.
                const outputTensor = model.run([inputData]);
                const probabilities = outputTensor[0];

                // 3. Find the Best Match (The "Argmax" Loop)
                let maxConfidence = -1;
                let predictedIndex = -1;

                for (let i = 0; i < probabilities.length; i++) {
                    if (probabilities[i] > maxConfidence) {
                        maxConfidence = probabilities[i]; // Save the highest score
                        predictedIndex = i;               // Save the ID number (0 to 99)
                    }
                }

                // 4. The Safety Threshold
                // Only trust the prediction if the AI is 80% confident or higher.
                if (maxConfidence >= 0.80) {
                    currentPrediction.value = labels[predictedIndex] || "Unknown User";
                    confidenceScore.value = maxConfidence;
                } else {
                    currentPrediction.value = "Unknown Face";
                    confidenceScore.value = maxConfidence;
                }
            });
        }
    }, [model, faceDetector]);

    // 6. LOADING SCREEN
    if (device == null || !model) {
        return (
            <View style={styles.container}>
                <Text style={{ color: 'white' }}>Booting up AI Engine...</Text>
            </View>
        );
    }

    // 7. THE ACTUAL USER INTERFACE
    return (
        <View style={styles.container}>
            <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                frameProcessor={frameProcessor}
                pixelFormat="rgb" // EfficientNet requires standard RGB colors
            />

            <View style={styles.overlay}>
                <Text style={styles.text}>{currentPrediction.value}</Text>
                {/* Dynamically show confidence score only if liveness is passed to avoid UI clutter */}
                <Text style={styles.subText}>
                    {hasPassedLiveness.value
                        ? `Match Confidence: ${(confidenceScore.value * 100).toFixed(1)}%`
                        : 'Awaiting Blink...'}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    overlay: { position: 'absolute', bottom: 50, backgroundColor: 'rgba(0,0,0,0.7)', padding: 20, borderRadius: 10 },
    text: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
    subText: { color: '#aaa', fontSize: 14, marginTop: 5, textAlign: 'center' }
});