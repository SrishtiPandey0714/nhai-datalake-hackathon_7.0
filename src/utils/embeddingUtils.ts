// src/utils/embeddingUtils.ts

export interface FaceDetectorBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceQualityData {
  yawAngle?: number;
  bounds: FaceDetectorBounds;
}

const EMBEDDING_LENGTH = 512;
const MAX_ENROLLMENT_YAW = 10.0; // Tighter yaw constraint for high-quality registration template
const CENTER_MARGIN_X = 60.0; // Horizontal deviation limit from screen center
const CENTER_MARGIN_Y = 100.0; // Vertical deviation limit from screen center

/**
 * Validates that the face embedding has the correct structure, size, and data types.
 * @param embedding The embedding vector to validate.
 * @returns boolean
 */
export function validateEmbedding(embedding: Float32Array): boolean {
  if (!(embedding instanceof Float32Array)) {
    return false;
  }
  if (embedding.length !== EMBEDDING_LENGTH) {
    return false;
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      return false;
    }
  }
  return true;
}

/**
 * Validates whether the detected face meets the quality requirements for enrollment (centered, low yaw).
 * @param face Face object returned by the detector
 * @param windowWidth Screen width
 * @param windowHeight Screen height
 */
export function validateEnrollmentQuality(
  face: FaceQualityData,
  windowWidth: number,
  windowHeight: number
): { isValid: boolean; reason?: string } {
  if (!face || !face.bounds) {
    return { isValid: false, reason: 'No face bounds detected' };
  }

  const yaw = face.yawAngle ?? 0;
  
  // 1. Validate yaw angle limit (LOCKED check: face must be facing straight)
  if (Math.abs(yaw) > MAX_ENROLLMENT_YAW) {
    return {
      isValid: false,
      reason: `Face turned too far (Yaw: ${yaw.toFixed(1)}°, max limit: ±${MAX_ENROLLMENT_YAW}°)`,
    };
  }

  // 2. Calculate center coordinates
  const faceCenterX = face.bounds.x + face.bounds.width / 2.0;
  const faceCenterY = face.bounds.y + face.bounds.height / 2.0;

  const screenCenterX = windowWidth / 2.0;
  const screenCenterY = windowHeight / 2.0;

  const dx = Math.abs(faceCenterX - screenCenterX);
  const dy = Math.abs(faceCenterY - screenCenterY);

  // 3. Validate horizontal centering
  if (dx > CENTER_MARGIN_X) {
    return {
      isValid: false,
      reason: `Face not centered horizontally (offset: ${dx.toFixed(1)}px, limit: ${CENTER_MARGIN_X}px)`,
    };
  }

  // 4. Validate vertical centering
  if (dy > CENTER_MARGIN_Y) {
    return {
      isValid: false,
      reason: `Face not centered vertically (offset: ${dy.toFixed(1)}px, limit: ${CENTER_MARGIN_Y}px)`,
    };
  }

  return { isValid: true };
}

/**
 * Averages exactly 5 embeddings element-wise to create a master template.
 * Validates that each embedding is exactly 512 dimensions.
 * @param embeddings Array of 5 face embedding vectors
 */
export function averageEmbeddings(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length !== 5) {
    throw new Error(`Enrollment requires exactly 5 embeddings. Got ${embeddings.length}.`);
  }

  for (let i = 0; i < embeddings.length; i++) {
    if (!validateEmbedding(embeddings[i])) {
      throw new Error(`Embedding index ${i} is invalid or its length is not 512.`);
    }
  }

  const master = new Float32Array(EMBEDDING_LENGTH);
  for (let i = 0; i < EMBEDDING_LENGTH; i++) {
    let sum = 0;
    for (let j = 0; j < embeddings.length; j++) {
      sum += embeddings[j][i];
    }
    master[i] = sum / embeddings.length;
  }

  return master;
}

/**
 * Serializes a Float32Array(512) into a Uint8Array(2048) for database storage as a BLOB.
 * @param embedding Float32Array vector
 */
export function serializeEmbedding(embedding: Float32Array): Uint8Array {
  if (!validateEmbedding(embedding)) {
    throw new Error('Cannot serialize: Invalid embedding format or length.');
  }
  return new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

/**
 * Deserializes a Uint8Array database blob back into a Float32Array(512).
 * Handles byte offset alignment and potential shared memory buffers from op-sqlite.
 * @param rawBlob Uint8Array binary blob
 */
export function deserializeEmbedding(rawBlob: Uint8Array): Float32Array {
  if (!(rawBlob instanceof Uint8Array)) {
    throw new Error('Deserialization error: Input must be a Uint8Array.');
  }

  if (rawBlob.byteLength !== EMBEDDING_LENGTH * Float32Array.BYTES_PER_ELEMENT) {
    throw new Error(`Deserialization error: Byte length must be ${EMBEDDING_LENGTH * 4} bytes. Got ${rawBlob.byteLength} bytes.`);
  }

  // Safe buffer extraction coping with byteOffsets and alignment boundaries
  const bufferCopy = rawBlob.buffer.slice(
    rawBlob.byteOffset,
    rawBlob.byteOffset + rawBlob.byteLength
  );

  const embedding = new Float32Array(bufferCopy);
  if (!validateEmbedding(embedding)) {
    throw new Error('Deserialization error: Reconstructed embedding is invalid.');
  }

  return embedding;
}

/**
 * Calculates the cosine similarity between two 512-dimensional face embeddings.
 * Supports normalization dynamically by calculating the norm of each vector.
 * @param vecA First embedding vector
 * @param vecB Second embedding vector
 */
export function calculateCosineSimilarity(vecA: Float32Array, vecB: Float32Array): number {
  if (!validateEmbedding(vecA) || !validateEmbedding(vecB)) {
    throw new Error('Similarity calculation error: Input vectors must be valid 512-dimensional arrays.');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < EMBEDDING_LENGTH; i++) {
    const valA = vecA[i];
    const valB = vecB[i];
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
