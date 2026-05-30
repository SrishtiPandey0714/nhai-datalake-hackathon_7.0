"""
============================================================================
AI ARCHITECT SANDBOX - LIVENESS TESTING (PYTHON) 🧪
============================================================================
* WHAT THIS FILE IS:
* This is a local Python prototyping script. It uses your laptop's webcam 
* to test the math for the "Blink Detection" (Liveness) engine before 
* porting the logic over to the mobile app's JavaScript framework.
* * NOTE FOR FRONTEND:
* This file is strictly for backend/AI testing. React Native cannot run 
* Python directly, so this file does not need to be integrated into the 
* mobile application codebase.
============================================================================
"""

import cv2
import mediapipe as mp
import math

# --- 1. Setup MediaPipe Face Mesh ---
# We initialize the MediaPipe Face Mesh model. This is the AI that scans 
# the video frame and outputs 468 specific X/Y coordinate points on the face.
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,               # We only need to track one face at a time for login
    refine_landmarks=True,         # Turns on extra precision around the eyes and lips
    min_detection_confidence=0.5,  # Needs to be 50% sure it sees a face to start tracking
    min_tracking_confidence=0.5    # Needs to be 50% sure it hasn't lost the face between frames
)

# --- 2. Define the Eye Landmarks ---
# Out of the 468 points, we only care about the 6 points making up the outline of each eye.
# These specific array indices are mapped by Google's MediaPipe documentation.
LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144]  # Corners: 33, 133. Top/Bottom: 160, 144 & 158, 153
RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380]

# --- 3. The Math Function (Calculate EAR) ---
# EAR = Eye Aspect Ratio. It measures the ratio of the eye's height to its width.
def calculate_ear(eye_points, landmarks, frame_width, frame_height):
    
    # Helper: MediaPipe outputs coordinates as a percentage (0.0 to 1.0).
    # We multiply by the frame width/height to get the actual pixel locations on the screen.
    def get_coord(point_index):
        pos = landmarks.landmark[point_index]
        return [pos.x * frame_width, pos.y * frame_height]

    p1 = get_coord(eye_points[0]) # Left-most corner
    p2 = get_coord(eye_points[1]) # Top eyelid point 1
    p3 = get_coord(eye_points[2]) # Top eyelid point 2
    p4 = get_coord(eye_points[3]) # Right-most corner
    p5 = get_coord(eye_points[4]) # Bottom eyelid point 2
    p6 = get_coord(eye_points[5]) # Bottom eyelid point 1

    # math.dist calculates the straight-line distance between two pixel points
    vertical_1 = math.dist(p2, p6) # Height 1
    vertical_2 = math.dist(p3, p5) # Height 2
    horizontal = math.dist(p1, p4) # Width

    # Safety catch to prevent dividing by zero if the AI glitches and width is 0
    if horizontal == 0: return 0
    
    # EAR Formula: (Height 1 + Height 2) / (2 * Width)
    # When open, this is usually ~0.30. When closed, it drops below ~0.20.
    ear = (vertical_1 + vertical_2) / (2.0 * horizontal)
    return ear

# --- 4. Open the Webcam ---
cap = cv2.VideoCapture(0) # '0' hooks into your primary built-in webcam

blink_count = 0
is_blinking = False
EAR_THRESHOLD = 0.22 # The magic number: If EAR drops below this, we register a closed eye

print("Starting Webcam... Press 'q' on your keyboard to quit.")

# Start the continuous video feed loop
while cap.isOpened():
    success, frame = cap.read() # Grab the latest frame from the camera
    if not success:
        break

    h, w, _ = frame.shape
    
    # MediaPipe requires standard RGB colors, but OpenCV captures video in BGR.
    # We must flip the color channels before handing the image to the AI.
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Feed the frame to MediaPipe to find the 468 facial landmarks
    results = face_mesh.process(rgb_frame)

    # If a face was successfully found in this frame...
    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            
            # Calculate the EAR for both the left and right eyes
            left_ear = calculate_ear(LEFT_EYE_POINTS, face_landmarks, w, h)
            right_ear = calculate_ear(RIGHT_EYE_POINTS, face_landmarks, w, h)
            
            # Average them together so a wink doesn't accidentally count as a full blink
            avg_ear = (left_ear + right_ear) / 2.0

            # --- 5. The Blink State Machine ---
            # If the ratio drops below our threshold, the eyes are currently shut
            if avg_ear < EAR_THRESHOLD:
                is_blinking = True
            else:
                # If the ratio is above the threshold, but 'is_blinking' is True,
                # it means the eyes just opened back up! We count 1 full blink.
                if is_blinking: 
                    blink_count += 1
                    is_blinking = False

            # Draw the live math on the video window so we can debug in real-time
            cv2.putText(frame, f"EAR: {avg_ear:.2f}", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, f"Blinks: {blink_count}", (30, 90), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

    # Render the final image with the text overlay to the screen
    cv2.imshow('Hackathon Liveness Prototype', frame)

    # Listen for the 'q' key to cleanly shut down the camera stream
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# Clean up system resources when finished
cap.release()
cv2.destroyAllWindows()