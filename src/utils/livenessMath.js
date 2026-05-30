/**
 * ============================================================================
 * HEY SHASHWAT - READ THIS FIRST! 🚀
 * ============================================================================
 * * WHAT THIS FILE IS:
 * This is the pure math engine for our Liveness Detection (Phase 2). 
 * We keep this math in a separate file so your UI components don't get 
 * cluttered and messy. 
 * * * FOLDER STRUCTURE:
 * Place this file specifically in your `src/utils/` folder:
 * * your-app/
 * ├── src/
 * │   ├── utils/
 * │   │   └── livenessMath.js  <-- (THIS FILE GOES HERE)
 * * * HOW TO USE IT IN YOUR APP:
 * You will import these two functions into your camera screen like this:
 * import { calculateEAR, detectHeadTurn } from '../utils/livenessMath';
 * * Then, inside your frame processor, you will pass the MediaPipe face 
 * landmarks into them to check if the user is a real, live human!
 * ============================================================================
 */

/**
 * ----------------------------------------------------------------------------
 * 1. BLINK DETECTION ENGINE (Eye Aspect Ratio / EAR)
 * ----------------------------------------------------------------------------
 * How it works: It measures the distance between the top and bottom eyelids. 
 * When the user blinks, the eyelids touch, the distance drops to almost zero, 
 * and the EAR value falls below 0.22.
 * * @param {Array} eyePoints - You must pass exactly 6 MediaPipe landmark points for ONE eye.
 * Order: [LeftCorner, Top1, Top2, RightCorner, Bottom2, Bottom1]
 * (e.g., MediaPipe Left Eye Indices: 33, 160, 158, 133, 153, 144)
 * @param {number} width - The width of the video frame
 * @param {number} height - The height of the video frame
 * @returns {number} The EAR decimal value (Trigger a "Blink" if this drops < 0.22)
 */
export const calculateEAR = (eyePoints, width, height) => {
    // Helper function to calculate the distance between two 2D points on the screen
    const getDistance = (p1, p2) => {
        const x1 = p1.x * width, y1 = p1.y * height;
        const x2 = p2.x * width, y2 = p2.y * height;
        return Math.hypot(x1 - x2, y1 - y2);
    };

    const p1 = eyePoints[0]; // Left-most corner of the eye
    const p2 = eyePoints[1]; // Top eyelid point 1
    const p3 = eyePoints[2]; // Top eyelid point 2
    const p4 = eyePoints[3]; // Right-most corner of the eye
    const p5 = eyePoints[4]; // Bottom eyelid point 2
    const p6 = eyePoints[5]; // Bottom eyelid point 1

    // Calculate the vertical distance (how wide the eye is open)
    const vertical1 = getDistance(p2, p6);
    const vertical2 = getDistance(p3, p5);

    // Calculate the horizontal distance (from corner to corner)
    const horizontal = getDistance(p1, p4);

    // Safety check: Prevent the app from crashing by dividing by zero if tracking glitches
    if (horizontal === 0) return 0;

    // Return the final mathematical ratio
    return (vertical1 + vertical2) / (2.0 * horizontal);
};

/**
 * ----------------------------------------------------------------------------
 * 2. HEAD TURN DETECTION ENGINE (Yaw Ratio)
 * ----------------------------------------------------------------------------
 * How it works: It looks at the tip of the nose and compares the distance 
 * to the left cheek vs. the right cheek. If the user turns their head, 
 * the nose gets closer to one side of the face outline.
 * * @param {Array} landmarks - Pass the ENTIRE array of all 468 MediaPipe face landmarks
 * @param {number} width - The width of the video frame
 * @param {number} height - The height of the video frame
 * @returns {string} - Returns exactly 'STRAIGHT', 'LEFT', or 'RIGHT'
 */
export const detectHeadTurn = (landmarks, width, height) => {
    // Helper function to calculate the distance between two 2D points
    const getDistance = (p1, p2) => {
        const x1 = p1.x * width, y1 = p1.y * height;
        const x2 = p2.x * width, y2 = p2.y * height;
        return Math.hypot(x1 - x2, y1 - y2);
    };

    // 1. Extract the three specific landmarks we need for head pose tracking
    const noseTip = landmarks[1];
    const leftFaceEdge = landmarks[234];
    const rightFaceEdge = landmarks[454];

    // 2. Calculate distances from the nose tip to the extreme edges of the face
    const leftDistance = getDistance(noseTip, leftFaceEdge);
    const rightDistance = getDistance(noseTip, rightFaceEdge);

    // Safety check: Prevent division by zero if tracking glitches
    if (rightDistance === 0) return 'STRAIGHT';

    // 3. Calculate the Yaw Ratio
    const turnRatio = leftDistance / rightDistance;

    // 4. Determine the direction based on standard thresholds.
    // NOTE TO SHASHWAT: If the camera angle in the app makes it too hard 
    // to trigger a turn, you can safely adjust the 0.5 and 2.0 numbers below!
    if (turnRatio < 0.5) {
        return 'LEFT';
    } else if (turnRatio > 2.0) {
        return 'RIGHT';
    } else {
        return 'STRAIGHT';
    }
};