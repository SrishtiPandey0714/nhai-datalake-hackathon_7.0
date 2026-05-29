import labels from './assets/labels.json';

/**
 * Interprets the 100-class output array from EfficientNetB0
 * @param {Float32Array} outputTensor - The raw output array from the model
 * @param {number} threshold - Minimum confidence required (default 0.80)
 */
export function interpretFacePrediction(outputTensor, threshold = 0.80) {
    let maxConfidence = -1;
    let predictedIndex = -1;

    for (let i = 0; i < outputTensor.length; i++) {
        if (outputTensor[i] > maxConfidence) {
            maxConfidence = outputTensor[i];
            predictedIndex = i;
        }
    }

    if (maxConfidence < threshold) {
        return { name: "Unknown Face", confidence: maxConfidence, index: -1 };
    }

    return {
        name: labels[predictedIndex] || `Unknown Index ${predictedIndex}`,
        confidence: maxConfidence,
        index: predictedIndex
    };
}