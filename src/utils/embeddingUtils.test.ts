// src/utils/embeddingUtils.test.ts

import {
  validateEmbedding,
  validateEnrollmentQuality,
  averageEmbeddings,
  serializeEmbedding,
  deserializeEmbedding,
  calculateCosineSimilarity,
} from './embeddingUtils';

describe('Embedding Utilities Math & Verification Tests', () => {
  // Helper to generate a valid embedding of size 512 filled with a value
  const createMockEmbedding = (val: number = 0.1): Float32Array => {
    return new Float32Array(512).fill(val);
  };

  describe('validateEmbedding', () => {
    it('should pass for a valid Float32Array of length 512', () => {
      const vec = createMockEmbedding();
      expect(validateEmbedding(vec)).toBe(true);
    });

    it('should fail if length is not 512', () => {
      const vec = new Float32Array(511);
      expect(validateEmbedding(vec)).toBe(false);
    });

    it('should fail if values are infinite or NaN', () => {
      const vec = createMockEmbedding();
      vec[100] = NaN;
      expect(validateEmbedding(vec)).toBe(false);

      const vec2 = createMockEmbedding();
      vec2[200] = Infinity;
      expect(validateEmbedding(vec2)).toBe(false);
    });

    it('should fail if input is not Float32Array', () => {
      const vec = Array(512).fill(0.1) as any;
      expect(validateEmbedding(vec)).toBe(false);
    });
  });

  describe('validateEnrollmentQuality', () => {
    const screenW = 360;
    const screenH = 640;

    it('should pass for a centered face with low yaw', () => {
      const face = {
        yawAngle: 5.0, // within ±10
        bounds: {
          x: 180 - 50, // center is at 180, width is 100, so x starts at 130
          y: 320 - 50, // center is at 320, height is 100, so y starts at 270
          width: 100,
          height: 100,
        },
      };
      const result = validateEnrollmentQuality(face, screenW, screenH);
      expect(result.isValid).toBe(true);
    });

    it('should fail if face is turned too far (yaw exceeds ±10°)', () => {
      const face = {
        yawAngle: 12.0, // exceeds ±10
        bounds: {
          x: 130,
          y: 270,
          width: 100,
          height: 100,
        },
      };
      const result = validateEnrollmentQuality(face, screenW, screenH);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('Face turned too far');
    });

    it('should fail if face is not centered horizontally', () => {
      const face = {
        yawAngle: 2.0,
        bounds: {
          x: 10, // far left
          y: 270,
          width: 100,
          height: 100,
        },
      };
      const result = validateEnrollmentQuality(face, screenW, screenH);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('centered horizontally');
    });

    it('should fail if face is not centered vertically', () => {
      const face = {
        yawAngle: 2.0,
        bounds: {
          x: 130,
          y: 20, // far top
          width: 100,
          height: 100,
        },
      };
      const result = validateEnrollmentQuality(face, screenW, screenH);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('centered vertically');
    });
  });

  describe('averageEmbeddings', () => {
    it('should average 5 vectors element-wise correctly', () => {
      const list = [
        createMockEmbedding(1.0),
        createMockEmbedding(2.0),
        createMockEmbedding(3.0),
        createMockEmbedding(4.0),
        createMockEmbedding(5.0),
      ];
      const avg = averageEmbeddings(list);
      expect(avg.length).toBe(512);
      expect(avg[0]).toBeCloseTo(3.0);
      expect(avg[256]).toBeCloseTo(3.0);
      expect(avg[511]).toBeCloseTo(3.0);
    });

    it('should throw an error if not exactly 5 vectors are provided', () => {
      const list = [
        createMockEmbedding(1.0),
        createMockEmbedding(2.0),
      ];
      expect(() => averageEmbeddings(list)).toThrow();
    });
  });

  describe('Serialization & Deserialization', () => {
    it('should serialize and deserialize an embedding accurately without data loss', () => {
      const original = createMockEmbedding(0.725);
      original[5] = 9.99;
      original[500] = -1.25;

      const serialized = serializeEmbedding(original);
      expect(serialized.length).toBe(512 * 4); // 2048 bytes

      const deserialized = deserializeEmbedding(serialized);
      expect(deserialized).toBeInstanceOf(Float32Array);
      expect(deserialized.length).toBe(512);
      expect(deserialized[0]).toBeCloseTo(0.725);
      expect(deserialized[5]).toBeCloseTo(9.99);
      expect(deserialized[500]).toBeCloseTo(-1.25);
    });
  });

  describe('calculateCosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      const vecA = createMockEmbedding(0.5);
      const vecB = createMockEmbedding(0.5);
      const sim = calculateCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(1.0);
    });

    it('should return -1.0 for exact opposite vectors', () => {
      const vecA = createMockEmbedding(0.5);
      const vecB = createMockEmbedding(-0.5);
      const sim = calculateCosineSimilarity(vecA, vecB);
      expect(sim).toBeCloseTo(-1.0);
    });

    it('should calculate correct similarity between two vectors', () => {
      const vecA = new Float32Array(512).fill(0);
      const vecB = new Float32Array(512).fill(0);

      // Define simple orthogonal/overlapping values
      vecA[0] = 1.0; vecA[1] = 2.0;
      vecB[0] = 2.0; vecB[1] = 4.0; // linearly dependent, cosine similarity should be 1.0
      expect(calculateCosineSimilarity(vecA, vecB)).toBeCloseTo(1.0);

      const vecC = new Float32Array(512).fill(0);
      vecC[0] = 1.0; vecC[1] = 0.0;
      const vecD = new Float32Array(512).fill(0);
      vecD[0] = 0.0; vecD[1] = 1.0; // orthogonal, cosine similarity should be 0
      expect(calculateCosineSimilarity(vecC, vecD)).toBeCloseTo(0);
    });
  });
});
