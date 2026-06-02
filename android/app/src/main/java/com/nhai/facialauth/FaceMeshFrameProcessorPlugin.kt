package com.nhai.facialauth

import android.util.Log
import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import com.mrousavy.camera.frameprocessors.VisionCameraProxy
import com.google.mediapipe.framework.image.MediaImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.facelandmarker.FaceLandmarker
import java.util.HashMap
import java.util.ArrayList

class FaceMeshFrameProcessorPlugin(proxy: VisionCameraProxy, options: Map<String, Any>?): FrameProcessorPlugin() {
    private var faceLandmarker: FaceLandmarker? = null

    init {
        try {
            val context = proxy.context
            val baseOptionsBuilder = BaseOptions.builder().setModelAssetPath("face_landmarker.task")
            val optionsBuilder = FaceLandmarker.FaceLandmarkerOptions.builder()
                .setBaseOptions(baseOptionsBuilder.build())
                .setMinFaceDetectionConfidence(0.5f)
                .setMinTrackingConfidence(0.5f)
                .setRunningMode(RunningMode.IMAGE) // Process frames synchronously on frame processor thread
            faceLandmarker = FaceLandmarker.createFromOptions(context, optionsBuilder.build())
            Log.d("FaceMeshPlugin", "MediaPipe FaceLandmarker initialized successfully")
        } catch (e: Exception) {
            Log.e("FaceMeshPlugin", "Failed to initialize FaceLandmarker", e)
        }
    }

    override fun callback(frame: Frame, params: Map<String, Any>?): Any? {
        val image = frame.image ?: return null

        // Determine rotation degrees robustly based on frame orientation metadata
        val orientationStr = frame.orientation.toString().uppercase()
        val rotationDegrees = when {
            orientationStr.contains("PORTRAIT_UPSIDE_DOWN") || orientationStr.contains("DOWN") -> 180
            orientationStr.contains("LANDSCAPE_LEFT") || orientationStr.contains("LEFT") -> 270
            orientationStr.contains("LANDSCAPE_RIGHT") || orientationStr.contains("RIGHT") -> 90
            orientationStr.contains("PORTRAIT") || orientationStr.contains("UP") -> 0
            else -> 0
        }

        try {
            val mpImage = MediaImageBuilder(image).build()
            
            // Apply rotation using MediaPipe's ImageProcessingOptions
            val imageProcessingOptions = ImageProcessingOptions.builder()
                .setRotationDegrees(rotationDegrees)
                .build()

            val result = faceLandmarker?.detect(mpImage, imageProcessingOptions) ?: return null
            mpImage.close()

            if (result.faceLandmarks().isEmpty()) {
                return null
            }

            // Extract the first detected face's landmarks (each face has 478 landmarks)
            val firstFaceLandmarks = result.faceLandmarks()[0]
            val landmarksList = ArrayList<Map<String, Any>>()
            
            for (landmark in firstFaceLandmarks) {
                val map = HashMap<String, Any>()
                map["x"] = landmark.x()
                map["y"] = landmark.y()
                map["z"] = landmark.z()
                landmarksList.add(map)
            }
            
            return landmarksList
        } catch (e: Exception) {
            Log.e("FaceMeshPlugin", "Error executing FaceLandmarker detection", e)
            return null
        }
    }
}
