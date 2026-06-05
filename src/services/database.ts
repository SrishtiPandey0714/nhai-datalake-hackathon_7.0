// src/services/database.ts

import { open, DB } from '@op-engineering/op-sqlite';
import { 
  serializeEmbedding, 
  deserializeEmbedding, 
  validateEmbedding 
} from '../utils/embeddingUtils';

// Initialize/Open connection to the local SQLite database
export const db: DB = open({
  name: 'nhai_facial_auth.db',
});

export interface Employee {
  employee_id: string;
  name: string;
  embedding: Float32Array;
  created_at: string;
}

export interface AttendanceLog {
  id: number;
  employee_id: string;
  timestamp: string;
  status: string;
  sync_status: string;
}

export interface ExtendedAttendanceLog extends AttendanceLog {
  name: string;
}


/**
 * Initializes database tables synchronously on startup.
 */
export function initDatabase(): void {
  try {
    // 1. Create employees table
    db.executeSync(`
      CREATE TABLE IF NOT EXISTS employees (
        employee_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        embedding BLOB NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // 2. Create attendance logs table (offline sync-status is set to PENDING)
    db.executeSync(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees (employee_id)
      );
    `);

    console.log('[Database] Tables initialized successfully');
  } catch (error) {
    console.error('[Database] Initialization error:', error);
    throw error;
  }
}

/**
 * Registers a new employee with a 512-dimension face embedding.
 * Uses the synchronous op-sqlite API.
 */
export function registerEmployee(employeeId: string, name: string, embedding: Float32Array): void {
  // Validate ID and Name parameters
  if (!employeeId || !employeeId.trim()) {
    throw new Error('Registration failed: Employee ID cannot be empty.');
  }
  if (!name || !name.trim()) {
    throw new Error('Registration failed: Name cannot be empty.');
  }

  // Validate the averaged embedding shape and dimensions
  if (!validateEmbedding(embedding)) {
    throw new Error('Registration failed: Invalid embedding dimensions (must be Float32Array of length 512).');
  }

  try {
    // Serialize embedding Float32Array(512) into a Uint8Array(2048)
    const binaryBlob = serializeEmbedding(embedding);
    const createdAt = new Date().toISOString();

    db.executeSync(
      `INSERT INTO employees (employee_id, name, embedding, created_at) 
       VALUES (?, ?, ?, ?);`,
      [employeeId.trim(), name.trim(), binaryBlob, createdAt]
    );

    console.log(`[Database] Employee ${employeeId} registered successfully`);
  } catch (error) {
    console.error(`[Database] Registration failed for ${employeeId}:`, error);
    throw error;
  }
}

/**
 * Retrieves an employee record by ID.
 * Returns the deserialized Float32Array(512) embedding template.
 */
export function getEmployeeById(employeeId: string): Employee | null {
  if (!employeeId || !employeeId.trim()) {
    return null;
  }

  try {
    const result = db.executeSync(
      'SELECT employee_id, name, embedding, created_at FROM employees WHERE employee_id = ?;',
      [employeeId.trim()]
    );

    if (!result || !result.rows || result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const rawBlob = row.embedding as Uint8Array;

    // Deserialization maps the raw SQLite BLOB bytes back into a Float32Array
    const embedding = deserializeEmbedding(rawBlob);

    return {
      employee_id: row.employee_id as string,
      name: row.name as string,
      embedding,
      created_at: row.created_at as string,
    };
  } catch (error) {
    console.error(`[Database] Failed to retrieve employee ${employeeId}:`, error);
    return null;
  }
}

/**
 * Checks if an employee ID already exists in the database.
 */
export function checkEmployeeExists(employeeId: string): boolean {
  if (!employeeId || !employeeId.trim()) {
    return false;
  }

  try {
    const result = db.executeSync(
      'SELECT 1 FROM employees WHERE employee_id = ?;',
      [employeeId.trim()]
    );
    return !!(result && result.rows && result.rows.length > 0);
  } catch (error) {
    console.error(`[Database] Failed check for employee existence ${employeeId}:`, error);
    return false;
  }
}

/**
 * Records an attendance event locally.
 */
export function logAttendance(employeeId: string, status: string): void {
  if (!employeeId || !employeeId.trim()) {
    throw new Error('Attendance logging failed: Employee ID cannot be empty.');
  }

  try {
    const timestamp = new Date().toISOString();
    const syncStatus = 'PENDING'; // Sprints exclude AWS synchronization

    db.executeSync(
      `INSERT INTO attendance_logs (employee_id, timestamp, status, sync_status) 
       VALUES (?, ?, ?, ?);`,
      [employeeId.trim(), timestamp, status, syncStatus]
    );

    console.log(`[Database] Attendance logged for ${employeeId} with status ${status}`);
  } catch (error) {
    console.error(`[Database] Failed to log attendance for ${employeeId}:`, error);
    throw error;
  }
}

/**
 * Retrieves the latest attendance logs.
 */
export function getAttendanceLogs(limit: number = 50): AttendanceLog[] {
  try {
    const result = db.executeSync(
      `SELECT id, employee_id, timestamp, status, sync_status 
       FROM attendance_logs 
       ORDER BY id DESC 
       LIMIT ?;`,
      [limit]
    );

    if (!result || !result.rows) {
      return [];
    }

    const logs: AttendanceLog[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      logs.push({
        id: row.id as number,
        employee_id: row.employee_id as string,
        timestamp: row.timestamp as string,
        status: row.status as string,
        sync_status: row.sync_status as string,
      });
    }

    return logs;
  } catch (error) {
    console.error('[Database] Failed to retrieve attendance logs:', error);
    return [];
  }
}

/**
 * Retrieves the latest attendance logs with employee names by performing a LEFT JOIN.
 * Supports filtering by employeeIdQuery and limits the results.
 * Sorted by newest timestamp first.
 */
export function getAttendanceLogsWithNames(
  employeeIdQuery: string = '',
  limit: number = 100
): ExtendedAttendanceLog[] {
  try {
    const trimmedQuery = employeeIdQuery.trim();
    let query = `
      SELECT l.id, l.employee_id, e.name, l.timestamp, l.status, l.sync_status 
      FROM attendance_logs l
      LEFT JOIN employees e ON l.employee_id = e.employee_id
    `;
    const params: any[] = [];

    if (trimmedQuery) {
      query += ` WHERE l.employee_id LIKE ?`;
      params.push(`%${trimmedQuery}%`);
    }

    query += ` ORDER BY l.timestamp DESC, l.id DESC LIMIT ?;`;
    params.push(limit);

    const result = db.executeSync(query, params);

    if (!result || !result.rows) {
      return [];
    }

    const logs: ExtendedAttendanceLog[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      logs.push({
        id: row.id as number,
        employee_id: row.employee_id as string,
        name: (row.name as string) || 'Unknown Employee',
        timestamp: row.timestamp as string,
        status: row.status as string,
        sync_status: row.sync_status as string,
      });
    }

    return logs;
  } catch (error) {
    console.error('[Database] Failed to retrieve attendance logs with names:', error);
    return [];
  }
}

/**
 * Retrieves the count of registered employees.
 */
export function getRegisteredEmployeeCount(): number {
  try {
    const result = db.executeSync('SELECT COUNT(*) as count FROM employees;');
    if (result && result.rows && result.rows.length > 0) {
      return (result.rows[0].count as number) || 0;
    }
    return 0;
  } catch (error) {
    console.error('[Database] Failed to get registered employee count:', error);
    return 0;
  }
}

/**
 * Retrieves the count of attendance records.
 */
export function getAttendanceRecordCount(): number {
  try {
    const result = db.executeSync('SELECT COUNT(*) as count FROM attendance_logs;');
    if (result && result.rows && result.rows.length > 0) {
      return (result.rows[0].count as number) || 0;
    }
    return 0;
  } catch (error) {
    console.error('[Database] Failed to get attendance record count:', error);
    return 0;
  }
}

/**
 * Retrieves the count of pending sync records.
 */
export function getPendingSyncCount(): number {
  try {
    const result = db.executeSync("SELECT COUNT(*) as count FROM attendance_logs WHERE sync_status = 'PENDING';");
    if (result && result.rows && result.rows.length > 0) {
      return (result.rows[0].count as number) || 0;
    }
    return 0;
  } catch (error) {
    console.error('[Database] Failed to get pending sync count:', error);
    return 0;
  }
}


/**
 * Retrieves the latest attendance logs that are pending synchronization.
 */
export function getPendingSyncLogs(limit: number = 100): AttendanceLog[] {
  try {
    const result = db.executeSync(
      `SELECT id, employee_id, timestamp, status, sync_status 
       FROM attendance_logs 
       WHERE sync_status = 'PENDING'
       ORDER BY timestamp DESC, id DESC
       LIMIT ?;`,
      [limit]
    );

    if (!result || !result.rows) {
      return [];
    }

    const logs: AttendanceLog[] = [];
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      logs.push({
        id: row.id as number,
        employee_id: row.employee_id as string,
        timestamp: row.timestamp as string,
        status: row.status as string,
        sync_status: row.sync_status as string,
      });
    }

    return logs;
  } catch (error) {
    console.error('[Database] Failed to retrieve pending sync logs:', error);
    return [];
  }
}

/**
 * Updates the sync status of the specified attendance logs to 'SYNCED'.
 */
export function markAttendanceLogsAsSynced(logIds: number[]): void {
  if (logIds.length === 0) return;
  try {
    const placeholders = logIds.map(() => '?').join(',');
    db.executeSync(
      `UPDATE attendance_logs SET sync_status = 'SYNCED' WHERE id IN (${placeholders});`,
      logIds
    );
    console.log(`[Database] Synced ${logIds.length} logs successfully`);
  } catch (error) {
    console.error('[Database] Failed to mark logs as synced:', error);
    throw error;
  }
}

/**
 * Utility function to delete an employee record (useful for reset/testing).
 */
export function deleteEmployee(employeeId: string): void {
  try {
    db.executeSync('DELETE FROM employees WHERE employee_id = ?;', [employeeId]);
    db.executeSync('DELETE FROM attendance_logs WHERE employee_id = ?;', [employeeId]);
    console.log(`[Database] Employee ${employeeId} deleted successfully`);
  } catch (error) {
    console.error(`[Database] Failed to delete employee ${employeeId}:`, error);
    throw error;
  }
}
