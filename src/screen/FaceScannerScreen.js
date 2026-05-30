/**
 * ============================================================================
 * HEY SHASHWAT - READ THIS FIRST! 🚀
 * ============================================================================
 * * WHY THIS FILE BELONGS IN YOUR BRANCH (FRONTEND):
 * This is the master UI screen for the Face Recognition step. It handles 
 * opening the camera, feeding the video frames into the AI chip, and 
 * displaying the recognized name on the screen. Because it uses React Native 
 * UI components, it needs to live in your frontend app!
 * * * FOLDER STRUCTURE & PATHS:
 * Place this file specifically in your `src/screens/` folder. 
 * I have already configured the paths below assuming your folder tree looks like this:
 * * your-app/
 * ├── assets/
 * │   ├── models/
 * │   │   └── facenet_edge_quantized.tflite  <-- (The AI model)
 * │   └── labels.json                        <-- (The actor dictionary)
 * ├── src/
 * │   ├── screens/
 * │   │   └── FaceScannerScreen.js           <-- (THIS FILE GOES HERE)
 * ============================================================================
 */

import React from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor, runAsync } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useSharedValue } from 'react-native-reanimated';

// Imports the dictionary mapping 0-99 to Actor Names.
// The '../../' jumps out of screens, out of src, and into the assets folder.
import labels from '../../assets/labels.json';

export function FaceRecognitionCamera() {
    // 1. TURN ON THE CAMERA
    // Grabs the front-facing selfie camera
    const device = useCameraDevice('front');

    // 2. CONFIGURE THE HARDWARE "BRAIN"
    // Uses Apple Neural Engine on iOS or Android Neural Networks API on Android.
    // This prevents battery drain and makes the AI run instantly.
    const delegateType = Platform.OS === 'ios' ? 'core-ml' : 'nnapi';

    // 3. LOAD THE AI MODEL
    // Loads our compressed model from the assets/models folder.
    const plugin = useTensorflowModel(
        require('../../assets/models/facenet_edge_quantized.tflite'),
        delegateType
    );
    const model = plugin.model;

    // 4. SET UP UI BRIDGES (Shared Values)
    // "Shared Values" act as a bridge to send data safely from the fast background camera thread to the UI screen.
    const currentPrediction = useSharedValue('Scanning...');
    const confidenceScore = useSharedValue(0);

    // 5. THE CAMERA FRAME PROCESSOR (The Engine)
    const frameProcessor = useFrameProcessor((frame) => {
        'worklet'; // Runs this heavy math on the ultra-fast native thread

        // runAsync ensures our AI math doesn't block the camera preview.
        runAsync(frame, () => {
            // If the model hasn't finished loading into memory yet, do nothing.
            if (!model) return;

            // STEP A: Prepare the Image
            // Converts the camera frame into a raw data buffer. 
            // Ensure your camera configuration resizes this to 224x224 RGB!
            const inputData = frame.toArrayBuffer();

            // STEP B: Run the AI
            // Feeds the image to the model, returning an array of 100 probabilities.
            const outputTensor = model.run([inputData]);
            const probabilities = outputTensor[0];

            // STEP C: Find the Best Match (The "Argmax" Loop)
            let maxConfidence = -1;
            let predictedIndex = -1;

            for (let i = 0; i < probabilities.length; i++) {
                if (probabilities[i] > maxConfidence) {
                    maxConfidence = probabilities[i]; // Save the highest score
                    predictedIndex = i;               // Save the ID number (0 to 99)
                }
            }

            // STEP D: The Safety Threshold
            // Only trust the prediction if the AI is 80% confident or higher.
            if (maxConfidence >= 0.80) {
                currentPrediction.value = labels[predictedIndex] || "Unknown User";
                confidenceScore.value = maxConfidence;
            } else {
                currentPrediction.value = "Unknown Face";
                confidenceScore.value = maxConfidence;
            }
        });
    }, [model]);

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
                <Text style={styles.text}>User: {currentPrediction.value}</Text>
                <Text style={styles.subText}>Match Confidence: {(confidenceScore.value * 100).toFixed(1)}%</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    overlay: { position: 'absolute', bottom: 50, backgroundColor: 'rgba(0,0,0,0.7)', padding: 20, borderRadius: 10 },
    text: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    subText: { color: '#aaa', fontSize: 14, marginTop: 5 }
});