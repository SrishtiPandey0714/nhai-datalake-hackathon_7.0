// src/services/syncService.test.ts

import {
  getPendingRecords,
  markRecordSynced,
  purgeSyncedRecords,
  getSyncedRecordCount
} from './syncService';

// Initialize a shared mock database store state
const testStore = {
  logs: [
    { id: 1, employee_id: 'EMP101', timestamp: '2026-06-05T10:00:00Z', status: 'PRESENT', sync_status: 'PENDING' },
    { id: 2, employee_id: 'EMP102', timestamp: '2026-06-05T10:01:00Z', status: 'PRESENT', sync_status: 'PENDING' },
  ] as any[]
};

// Mock the database to intercept execution calls
jest.mock('./database', () => {
  return {
    db: {
      executeSync: jest.fn((query: string, params: any[] = []) => {
        const sql = query.trim().replace(/\s+/g, ' ').toUpperCase();

        if (sql.includes("SELECT COUNT(*) AS COUNT FROM ATTENDANCE_LOGS WHERE SYNC_STATUS = 'SYNCED'")) {
          const count = testStore.logs.filter((l) => l.sync_status === 'SYNCED').length;
          return { rows: [{ count }] };
        }

        if (sql.includes("SELECT ID, EMPLOYEE_ID, TIMESTAMP, STATUS, SYNC_STATUS FROM ATTENDANCE_LOGS WHERE SYNC_STATUS = 'PENDING'")) {
          const rows = testStore.logs.filter((l) => l.sync_status === 'PENDING');
          return { rows };
        }

        if (sql.includes("UPDATE ATTENDANCE_LOGS SET SYNC_STATUS = 'SYNCED' WHERE ID = ?")) {
          const id = params[0];
          const log = testStore.logs.find((l) => l.id === id);
          if (log) {
            log.sync_status = 'SYNCED';
          }
          return { rowsAffected: 1 };
        }

        if (sql.includes("DELETE FROM ATTENDANCE_LOGS WHERE SYNC_STATUS = 'SYNCED'")) {
          const initialLength = testStore.logs.length;
          testStore.logs = testStore.logs.filter((l) => l.sync_status !== 'SYNCED');
          const deleted = initialLength - testStore.logs.length;
          return { rowsAffected: deleted };
        }

        return { rows: [], rowsAffected: 0 };
      }),
    },
  };
});

describe('syncService Unit Tests', () => {
  beforeEach(() => {
    testStore.logs = [
      { id: 1, employee_id: 'EMP101', timestamp: '2026-06-05T10:00:00Z', status: 'PRESENT', sync_status: 'PENDING' },
      { id: 2, employee_id: 'EMP102', timestamp: '2026-06-05T10:01:00Z', status: 'PRESENT', sync_status: 'PENDING' },
    ];
  });

  it('should accurately return pending logs from SQLite', () => {
    const pending = getPendingRecords();
    expect(pending.length).toBe(2);
    expect(pending[0].employee_id).toBe('EMP101');
    expect(pending[0].sync_status).toBe('PENDING');
  });

  it('should change status to SYNCED on markRecordSynced', () => {
    markRecordSynced(1);
    expect(getSyncedRecordCount()).toBe(1);
    
    const pending = getPendingRecords();
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe(2);
  });

  it('should remove synced rows from db on purgeSyncedRecords', () => {
    markRecordSynced(1);
    markRecordSynced(2);
    
    expect(getSyncedRecordCount()).toBe(2);
    expect(getPendingRecords().length).toBe(0);

    const deletedCount = purgeSyncedRecords();
    expect(deletedCount).toBe(2);
    expect(getSyncedRecordCount()).toBe(0);
  });
});
