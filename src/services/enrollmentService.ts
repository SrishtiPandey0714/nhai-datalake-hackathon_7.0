// src/services/enrollmentService.ts

import { registerEmployee } from './database';
import { 
  averageEmbeddings, 
  validateEmbedding, 
  calculateCosineSimilarity 
} from '../utils/embeddingUtils';

export type EnrollmentSessionStatus = 'collecting' | 'quality_rejected' | 'complete' | 'error';

export interface EnrollmentSessionResult {
  status: EnrollmentSessionStatus;
  count: number;
  error?: string;
}

const REQUIRED_EMBEDDINGS_COUNT = 5;
const DIVERSITY_SIMILARITY_THRESHOLD = 0.99; // If cosine similarity is higher than this, frames are too identical (static face)

export class EnrollmentSession {
  private employeeId: string;
  private name: string;
  private embeddings: Float32Array[] = [];

  constructor(employeeId: string, name: string) {
    if (!employeeId || !employeeId.trim()) {
      throw new Error('EnrollmentSession Error: Employee ID is required.');
    }
    if (!name || !name.trim()) {
      throw new Error('EnrollmentSession Error: Employee name is required.');
    }
    this.employeeId = employeeId.trim();
    this.name = name.trim();
  }

  /**
   * Returns the employee ID associated with this session.
   */
  getEmployeeId(): string {
    return this.employeeId;
  }

  /**
   * Returns the name associated with this session.
   */
  getName(): string {
    return this.name;
  }

  /**
   * Returns the number of successfully collected embeddings.
   */
  getCapturedCount(): number {
    return this.embeddings.length;
  }

  /**
   * Returns the total required embeddings count.
   */
  getRequiredCount(): number {
    return REQUIRED_EMBEDDINGS_COUNT;
  }

  /**
   * Returns the collected embeddings.
   */
  getEmbeddings(): Float32Array[] {
    return [...this.embeddings];
  }

  /**
   * Resets the enrollment session state.
   */
  reset(): void {
    this.embeddings = [];
  }

  /**
   * Adds an embedding to the session.
   * Performs length validation, embedding space diversity check, and saves to database on completion.
   */
  addEmbedding(embedding: Float32Array): EnrollmentSessionResult {
    // 1. Validation: Validate length is exactly 512 dimensions
    if (!validateEmbedding(embedding)) {
      return {
        status: 'error',
        count: this.embeddings.length,
        error: 'Invalid embedding dimensions (must be 512 dimensions).',
      };
    }

    if (this.embeddings.length >= REQUIRED_EMBEDDINGS_COUNT) {
      return {
        status: 'complete',
        count: this.embeddings.length,
      };
    }

    // 2. Diversity Check: Compare against the last captured embedding
    if (this.embeddings.length > 0) {
      const lastEmbedding = this.embeddings[this.embeddings.length - 1];
      const similarity = calculateCosineSimilarity(embedding, lastEmbedding);

      if (similarity > DIVERSITY_SIMILARITY_THRESHOLD) {
        return {
          status: 'quality_rejected',
          count: this.embeddings.length,
          error: 'Face is too static. Move your head slightly to capture different angles.',
        };
      }
    }

    // 3. Append valid, diverse embedding
    this.embeddings.push(embedding);

    // 4. Check if session is complete
    if (this.embeddings.length === REQUIRED_EMBEDDINGS_COUNT) {
      try {
        // Average the 5 embeddings
        const masterTemplate = averageEmbeddings(this.embeddings);

        // Save master template to SQLite
        registerEmployee(this.employeeId, this.name, masterTemplate);

        return {
          status: 'complete',
          count: this.embeddings.length,
        };
      } catch (dbError: any) {
        // Back out the last embedding since saving failed
        this.embeddings.pop();
        return {
          status: 'error',
          count: this.embeddings.length,
          error: `Database save failed: ${dbError?.message || dbError}`,
        };
      }
    }

    return {
      status: 'collecting',
      count: this.embeddings.length,
    };
  }
}
