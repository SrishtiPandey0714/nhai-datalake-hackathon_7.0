// livenessMath.js

/**
 * Calculates the Eye Aspect Ratio (EAR) to detect blinking.
 * @param {Array} eyePoints - Array of 6 MediaPipe landmark objects {x, y} for one eye
 * Order: [LeftCorner, Top1, Top2, RightCorner, Bottom2, Bottom1]
 * @param {number} width - Video frame width
 * @param {number} height - Video frame height
 * @returns {number} EAR value (Usually drops below 0.22 during a blink)
 */
export const calculateEAR = (eyePoints, width, height) => {
    // Helper function to calculate the distance between two 2D points
    const getDistance = (p1, p2) => {
        const x1 = p1.x * width, y1 = p1.y * height;
        const x2 = p2.x * width, y2 = p2.y * height;
        return Math.hypot(x1 - x2, y1 - y2);
    };

    const p1 = eyePoints[0]; // Left corner
    const p2 = eyePoints[1]; // Top 1
    const p3 = eyePoints[2]; // Top 2
    const p4 = eyePoints[3]; // Right corner
    const p5 = eyePoints[4]; // Bottom 2
    const p6 = eyePoints[5]; // Bottom 1

    // Calculate vertical and horizontal distances
    const vertical1 = getDistance(p2, p6);
    const vertical2 = getDistance(p3, p5);
    const horizontal = getDistance(p1, p4);

    // Prevent dividing by zero if the face tracking glitches
    if (horizontal === 0) return 0;

    // Return the final ratio 
    return (vertical1 + vertical2) / (2.0 * horizontal);
};
/**
 * Calculates the Head Turn Ratio (Yaw) to detect if the user is looking away.
 * @param {Array} landmarks - The full array of 468 MediaPipe face landmarks
 * @param {number} width - Video frame width
 * @param {number} height - Video frame height
 * @returns {string} - Returns 'STRAIGHT', 'LEFT', or 'RIGHT'
 */
export const detectHeadTurn = (landmarks, width, height) => {
    // Helper function to calculate the distance between two 2D points
    const getDistance = (p1, p2) => {
        const x1 = p1.x * width, y1 = p1.y * height;
        const x2 = p2.x * width, y2 = p2.y * height;
        return Math.hypot(x1 - x2, y1 - y2);
    };

    // 1. Extract the specific landmarks for head pose tracking
    const noseTip = landmarks[1];
    const leftFaceEdge = landmarks[234];
    const rightFaceEdge = landmarks[454];

    // 2. Calculate distances from the nose tip to the edges of the face
    const leftDistance = getDistance(noseTip, leftFaceEdge);
    const rightDistance = getDistance(noseTip, rightFaceEdge);

    // Prevent division by zero if the tracking glitches
    if (rightDistance === 0) return 'STRAIGHT';

    // 3. Calculate the Yaw Ratio
    const turnRatio = leftDistance / rightDistance;

    // 4. Determine head position based on the threshold
    // Note: These thresholds (0.5 and 2.0) are standard baselines. 
    // Shashwat can adjust these slightly in the UI if the camera angle requires it.
    if (turnRatio < 0.5) {
        return 'LEFT';
    } else if (turnRatio > 2.0) {
        return 'RIGHT';
    } else {
        return 'STRAIGHT';
    }
};