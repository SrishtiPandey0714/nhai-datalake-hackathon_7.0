import cv2
import mediapipe as mp
import math

# --- 1. Setup MediaPipe Face Mesh ---
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1, 
    refine_landmarks=True, 
    min_detection_confidence=0.5, 
    min_tracking_confidence=0.5
)

# --- 2. Define the Eye Landmarks ---
# MediaPipe maps 468 points on the face. These specific numbers correspond to the eyes.
LEFT_EYE_POINTS = [33, 160, 158, 133, 153, 144]  # Corners: 33, 133. Top/Bottom: 160, 144 & 158, 153
RIGHT_EYE_POINTS = [362, 385, 387, 263, 373, 380]

# --- 3. The Math Function (Calculate EAR) ---
def calculate_ear(eye_points, landmarks, frame_width, frame_height):
    # Convert MediaPipe's normalized coordinates (0 to 1) to actual pixel coordinates
    def get_coord(point_index):
        pos = landmarks.landmark[point_index]
        return [pos.x * frame_width, pos.y * frame_height]

    p1 = get_coord(eye_points[0]) # Left corner
    p2 = get_coord(eye_points[1]) # Top 1
    p3 = get_coord(eye_points[2]) # Top 2
    p4 = get_coord(eye_points[3]) # Right corner
    p5 = get_coord(eye_points[4]) # Bottom 2
    p6 = get_coord(eye_points[5]) # Bottom 1

    # Calculate distances
    vertical_1 = math.dist(p2, p6)
    vertical_2 = math.dist(p3, p5)
    horizontal = math.dist(p1, p4)

    # Calculate EAR
    if horizontal == 0: return 0
    ear = (vertical_1 + vertical_2) / (2.0 * horizontal)
    return ear

# --- 4. Open the Webcam ---
cap = cv2.VideoCapture(0) # '0' is usually your built-in laptop webcam

blink_count = 0
is_blinking = False
EAR_THRESHOLD = 0.22 # If EAR drops below this, the eye is closed

print("Starting Webcam... Press 'q' on your keyboard to quit.")

while cap.isOpened():
    success, frame = cap.read()
    if not success:
        break

    h, w, _ = frame.shape
    # MediaPipe needs RGB images, but OpenCV reads in BGR. We must convert it.
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Process the frame to find the face
    results = face_mesh.process(rgb_frame)

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            
            # Calculate EAR for both eyes
            left_ear = calculate_ear(LEFT_EYE_POINTS, face_landmarks, w, h)
            right_ear = calculate_ear(RIGHT_EYE_POINTS, face_landmarks, w, h)
            
            # Average the two eyes together
            avg_ear = (left_ear + right_ear) / 2.0

            # --- 5. The Blink Logic ---
            if avg_ear < EAR_THRESHOLD:
                is_blinking = True
            else:
                if is_blinking: # The eye just opened back up!
                    blink_count += 1
                    is_blinking = False

            # Draw text on the screen so we can see the math working live
            cv2.putText(frame, f"EAR: {avg_ear:.2f}", (30, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
            cv2.putText(frame, f"Blinks: {blink_count}", (30, 90), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

    # Show the video window
    cv2.imshow('Hackathon Liveness Prototype', frame)

    # Quit if 'q' is pressed
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()