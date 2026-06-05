// src/services/enrollmentService.test.ts

import { EnrollmentSession } from './enrollmentService';
import { registerEmployee } from './database';

// Mock the database module to avoid running native op-sqlite code in Jest
jest.mock('./database', () => ({
  registerEmployee: jest.fn(),
  checkEmployeeExists: jest.fn(),
  getEmployeeById: jest.fn(),
  logAttendance: jest.fn(),
  getAttendanceLogs: jest.fn(),
}));

describe('EnrollmentSession Service Tests', () => {
  const mockId = 'EMP100';
  const mockName = 'Vikram Sharma';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createMockEmbedding = (val: number = 0): Float32Array => {
    const vec = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      vec[i] = Math.sin(i + val);
    }
    return vec;
  };

  it('should initialize with employee metadata', () => {
    const session = new EnrollmentSession(mockId, mockName);
    expect(session.getEmployeeId()).toBe(mockId);
    expect(session.getName()).toBe(mockName);
    expect(session.getCapturedCount()).toBe(0);
    expect(session.getRequiredCount()).toBe(5);
  });

  it('should throw if id or name is invalid', () => {
    expect(() => new EnrollmentSession('', mockName)).toThrow();
    expect(() => new EnrollmentSession(mockId, '   ')).toThrow();
  });

  it('should collect embeddings up to 5 and complete successfully', () => {
    const session = new EnrollmentSession(mockId, mockName);

    // Feed 5 diverse embeddings (using larger phase differences so similarity < 0.99)
    for (let i = 0; i < 4; i++) {
      const vec = createMockEmbedding(i * 2.0);
      const result = session.addEmbedding(vec);
      expect(result.status).toBe('collecting');
      expect(result.count).toBe(i + 1);
    }

    // Add the 5th embedding
    const lastVec = createMockEmbedding(4 * 2.0);
    const finalResult = session.addEmbedding(lastVec);

    expect(finalResult.status).toBe('complete');
    expect(finalResult.count).toBe(5);

    // Verify database registration was called
    expect(registerEmployee).toHaveBeenCalledTimes(1);
    expect(registerEmployee).toHaveBeenCalledWith(
      mockId,
      mockName,
      expect.any(Float32Array)
    );
  });

  it('should reject static frames (diversity check failure)', () => {
    const session = new EnrollmentSession(mockId, mockName);

    // Add first embedding
    const vec1 = createMockEmbedding(0.2);
    const res1 = session.addEmbedding(vec1);
    expect(res1.status).toBe('collecting');
    expect(res1.count).toBe(1);

    // Add second embedding with exactly identical values (similarity = 1.0)
    const vec2 = createMockEmbedding(0.2);
    const res2 = session.addEmbedding(vec2);
    expect(res2.status).toBe('quality_rejected');
    expect(res2.count).toBe(1); // count should still be 1
    expect(res2.error).toContain('Face is too static');
  });

  it('should reject invalid embeddings with error status', () => {
    const session = new EnrollmentSession(mockId, mockName);

    // Invalid length vector
    const invalidVec = new Float32Array(500);
    const result = session.addEmbedding(invalidVec);
    expect(result.status).toBe('error');
    expect(result.error).toContain('Invalid embedding dimensions');
  });
});
