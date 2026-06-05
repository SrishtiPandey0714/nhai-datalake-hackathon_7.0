// src/services/enrollmentIntegration.test.ts

import { EnrollmentSession } from './enrollmentService';
import { 
  registerEmployee, 
  getEmployeeById, 
  checkEmployeeExists 
} from './database';
import { calculateCosineSimilarity } from '../utils/embeddingUtils';

// 1. Set up an in-memory database mock to simulate SQLite table stores
const dbStore: {
  employees: Array<{
    employee_id: string;
    name: string;
    embedding: Uint8Array; // Uint8Array as BLOB representation
    created_at: string;
  }>;
  attendance_logs: any[];
} = {
  employees: [],
  attendance_logs: [],
};

// 2. Mock @op-engineering/op-sqlite to intercept executeSync and simulate SQLite logic
jest.mock('@op-engineering/op-sqlite', () => {
  return {
    open: () => ({
      executeSync: (query: string, params: any[] = []) => {
        const sql = query.trim().replace(/\s+/g, ' ').toUpperCase();

        // Simulate: CREATE TABLE
        if (sql.includes('CREATE TABLE')) {
          return { rowsAffected: 0 };
        }

        // Simulate: SELECT 1 FROM employees WHERE employee_id = ?
        if (sql.includes('SELECT 1 FROM EMPLOYEES WHERE EMPLOYEE_ID = ?')) {
          const id = params[0]?.trim();
          const exists = dbStore.employees.some(e => e.employee_id === id);
          return {
            rows: exists ? [{ '1': 1 }] : [],
          };
        }

        // Simulate: INSERT INTO employees
        if (sql.includes('INSERT INTO EMPLOYEES')) {
          const [id, name, embedding, createdAt] = params;
          const trimmedId = id?.trim();

          // Enforce UNIQUE constraint on employee_id at SQLite layer
          if (dbStore.employees.some(e => e.employee_id === trimmedId)) {
            throw new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: employees.employee_id');
          }

          dbStore.employees.push({
            employee_id: trimmedId,
            name: name?.trim(),
            embedding: new Uint8Array(embedding), // clone the Uint8Array buffer
            created_at: createdAt,
          });
          return { rowsAffected: 1 };
        }

        // Simulate: SELECT * FROM employees WHERE employee_id = ?
        if (sql.includes('SELECT EMPLOYEE_ID, NAME, EMBEDDING, CREATED_AT FROM EMPLOYEES WHERE EMPLOYEE_ID = ?')) {
          const id = params[0]?.trim();
          const record = dbStore.employees.find(e => e.employee_id === id);
          if (!record) {
            return { rows: [] };
          }
          return {
            rows: [{
              employee_id: record.employee_id,
              name: record.name,
              embedding: record.embedding, // returns the BLOB data
              created_at: record.created_at,
            }],
          };
        }

        return { rows: [], rowsAffected: 0 };
      },
    }),
  };
});

describe('Integration Validation: Enrollment & Database Persistence', () => {
  beforeEach(() => {
    // Clear mock database store between tests
    dbStore.employees = [];
    dbStore.attendance_logs = [];
  });

  const createMockEmbedding = (val: number): Float32Array => {
    const vec = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      vec[i] = Math.sin(i + val);
    }
    return vec;
  };

  // Test 1: Register employee and confirm SQLite persistence
  it('1. Should register a new employee and create a SQLite row', () => {
    console.log('\n--- TEST 1: Register employee and confirm SQLite persistence ---');
    const employeeId = 'EMP552';
    const name = 'Srishti Pandey';
    const session = new EnrollmentSession(employeeId, name);

    // Feed 5 diverse embeddings (cosine similarity < 0.99)
    for (let i = 0; i < 5; i++) {
      const vec = createMockEmbedding(i * 2.0);
      const result = session.addEmbedding(vec);
      console.log(`Frame ${i + 1}/5 status: ${result.status}, count: ${result.count}`);
    }

    // Confirm that a row was persisted inside our database store
    expect(dbStore.employees.length).toBe(1);
    expect(dbStore.employees[0].employee_id).toBe(employeeId);
    expect(dbStore.employees[0].name).toBe(name);
    console.log('✓ SQLite row confirmed created.');
  });

  // Test 2: Retrieve embedding and verify properties
  it('2. Should retrieve the stored embedding and verify length === 512 and cosine similarity ≈ 1.0', () => {
    console.log('\n--- TEST 2: Retrieve embedding and verify length/cosineSimilarity ---');
    const employeeId = 'EMP101';
    const name = 'Shashwat Mishra';
    
    // Create and average test embeddings manually to register
    const list = [
      createMockEmbedding(1.0),
      createMockEmbedding(2.0),
      createMockEmbedding(3.0),
      createMockEmbedding(4.0),
      createMockEmbedding(5.0),
    ];
    
    // Average them to build the original template
    const dim = 512;
    const originalTemplate = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      let sum = 0;
      for (let j = 0; j < list.length; j++) {
        sum += list[j][i];
      }
      originalTemplate[i] = sum / list.length;
    }

    // Register employee
    registerEmployee(employeeId, name, originalTemplate);

    // Retrieve from database
    const retrievedRecord = getEmployeeById(employeeId);
    expect(retrievedRecord).not.toBeNull();

    const retrievedEmbedding = retrievedRecord!.embedding;

    // Verify properties
    console.log(`Retrieved embedding length: ${retrievedEmbedding.length}`);
    expect(retrievedEmbedding.length).toBe(512);

    const similarity = calculateCosineSimilarity(originalTemplate, retrievedEmbedding);
    console.log(`Cosine similarity (original vs retrieved): ${similarity}`);
    expect(similarity).toBeCloseTo(1.0, 5); // Must be identical up to floating point limits
    console.log('✓ Retrieved embedding size is 512, and similarity to original template is ≈ 1.0');
  });

  // Test 3: Attempt duplicate registration and check SQLite rejection
  it('3. Should reject duplicate registrations using the same Employee ID', () => {
    console.log('\n--- TEST 3: Attempt duplicate registration and confirm rejection ---');
    const employeeId = 'EMP999';
    const name1 = 'Rahul Sen';
    const name2 = 'Rahul Sen Duplicate';
    
    const vec = createMockEmbedding(1.0);

    // Register first employee
    registerEmployee(employeeId, name1, vec);
    expect(checkEmployeeExists(employeeId)).toBe(true);

    // Attempt second registration with the same ID, should throw UNIQUE constraint failure
    console.log('Registering second employee with same ID...');
    expect(() => {
      registerEmployee(employeeId, name2, vec);
    }).toThrow('SQLITE_CONSTRAINT: UNIQUE constraint failed');

    // Confirm that the database only contains the original employee record
    const record = getEmployeeById(employeeId);
    expect(record!.name).toBe(name1);
    console.log('✓ Duplicate registration rejected at database constraint layer.');
  });

  // Test 4: Verify quality_rejected on identical frames
  it('4. Should trigger quality_rejected status when captures are too similar (diversity check)', () => {
    console.log('\n--- TEST 4: Confirm quality_rejected on similar captures ---');
    const session = new EnrollmentSession('EMP302', 'Aditi Verma');

    // Add first frame
    const vec1 = createMockEmbedding(0.5);
    let res = session.addEmbedding(vec1);
    console.log(`Frame 1 status: ${res.status}, count: ${res.count}`);

    // Add identical second frame (similarity = 1.0)
    const vec2 = createMockEmbedding(0.5);
    res = session.addEmbedding(vec2);
    console.log(`Frame 2 status: ${res.status}, count: ${res.count}, error: ${res.error}`);
    
    expect(res.status).toBe('quality_rejected');
    expect(res.count).toBe(1); // Count must not increase
    console.log('✓ Diversity validation successfully blocked duplicates with quality_rejected status.');
  });

  // Test 5: Confirm enrollment only completes after exactly 5 accepted embeddings
  it('5. Should confirm enrollment only completes after exactly 5 accepted embeddings', () => {
    console.log('\n--- TEST 5: Confirm enrollment only completes after exactly 5 accepted embeddings ---');
    const session = new EnrollmentSession('EMP404', 'Varun Shah');

    for (let i = 0; i < 4; i++) {
      const vec = createMockEmbedding(i * 3.0);
      const res = session.addEmbedding(vec);
      expect(res.status).toBe('collecting');
      expect(res.count).toBe(i + 1);
      console.log(`Captured: ${res.count}/5. Status: ${res.status}`);
    }

    // Add 5th embedding
    const finalVec = createMockEmbedding(4 * 3.0);
    const finalRes = session.addEmbedding(finalVec);
    expect(finalRes.status).toBe('complete');
    expect(finalRes.count).toBe(5);
    console.log(`Captured: ${finalRes.count}/5. Status: ${finalRes.status}`);
    console.log('✓ Enrollment session successfully completes only after exactly 5 captures.');
  });
});
