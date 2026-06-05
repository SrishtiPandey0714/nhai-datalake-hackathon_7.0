// src/services/syncService.ts

import { db, AttendanceLog } from './database';

/**
 * Retrieves all attendance records that are pending synchronization.
 */
export function getPendingRecords(): AttendanceLog[] {
  try {
    const result = db.executeSync(
      `SELECT id, employee_id, timestamp, status, sync_status 
       FROM attendance_logs 
       WHERE sync_status = 'PENDING'
       ORDER BY timestamp DESC, id DESC;`
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
    console.error('[SyncService] Failed to fetch pending records:', error);
    return [];
  }
}

/**
 * Marks a specific local record as synchronized (sync_status = 'SYNCED').
 */
export function markRecordSynced(id: number): void {
  try {
    db.executeSync(
      `UPDATE attendance_logs 
       SET sync_status = 'SYNCED' 
       WHERE id = ?;`,
      [id]
    );
    console.log(`[SyncService] Record ${id} marked as SYNCED`);
  } catch (error) {
    console.error(`[SyncService] Failed to mark record ${id} as synced:`, error);
    throw error;
  }
}

/**
 * Purges all synchronized records (sync_status = 'SYNCED') from the local database.
 * Returns the number of records deleted.
 */
export function purgeSyncedRecords(): number {
  try {
    // Determine number of records to be deleted first
    const countResult = db.executeSync(
      `SELECT COUNT(*) as count FROM attendance_logs WHERE sync_status = 'SYNCED';`
    );
    const count = countResult?.rows?.[0]?.count as number || 0;

    if (count > 0) {
      db.executeSync(
        `DELETE FROM attendance_logs WHERE sync_status = 'SYNCED';`
      );
      console.log(`[SyncService] Purged ${count} synced records from local SQLite`);
    }

    return count;
  } catch (error) {
    console.error('[SyncService] Failed to purge synced records:', error);
    throw error;
  }
}

/**
 * Retrieves the count of already synced records.
 */
export function getSyncedRecordCount(): number {
  try {
    const countResult = db.executeSync(
      `SELECT COUNT(*) as count FROM attendance_logs WHERE sync_status = 'SYNCED';`
    );
    return (countResult?.rows?.[0]?.count as number) || 0;
  } catch (error) {
    console.error('[SyncService] Failed to get synced record count:', error);
    return 0;
  }
}
