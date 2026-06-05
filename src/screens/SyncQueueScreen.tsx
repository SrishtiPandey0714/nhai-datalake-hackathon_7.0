// src/screens/SyncQueueScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  getPendingRecords,
  markRecordSynced,
  purgeSyncedRecords,
  getSyncedRecordCount
} from '../services/syncService';
import { AttendanceLog } from '../services/database';

interface SyncQueueScreenProps {
  onBack: () => void;
}

export const SyncQueueScreen: React.FC<SyncQueueScreenProps> = ({ onBack }) => {
  const [pendingLogs, setPendingLogs] = useState<AttendanceLog[]>([]);
  const [syncedCount, setSyncedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadData = () => {
    setLoading(true);
    try {
      const pending = getPendingRecords();
      const synced = getSyncedRecordCount();
      setPendingLogs(pending);
      setSyncedCount(synced);
    } catch (err) {
      console.error('Error loading sync queue data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSyncSimulation = () => {
    if (pendingLogs.length === 0) {
      Alert.alert('Info', 'No pending records to synchronize.');
      return;
    }

    setSyncing(true);
    // Simulate AWS API Gateway upload delay
    setTimeout(() => {
      try {
        pendingLogs.forEach((log) => {
          markRecordSynced(log.id);
        });
        Alert.alert(
          'Sync Success',
          `Successfully synchronized ${pendingLogs.length} records to Cloud (DynamoDB). These records are now marked as SYNCED and ready to be purged.`
        );
        loadData();
      } catch (err) {
        console.error('Failed to sync:', err);
        Alert.alert('Sync Error', 'An error occurred during synchronization.');
      } finally {
        setSyncing(false);
      }
    }, 1500);
  };

  const handlePurgeSimulation = () => {
    if (syncedCount === 0) {
      Alert.alert('Info', 'No synced records to purge.');
      return;
    }

    setPurging(true);
    // Simulate purging records from local SQLite
    setTimeout(() => {
      try {
        const deleted = purgeSyncedRecords();
        Alert.alert(
          'Purge Success',
          `Successfully purged ${deleted} synchronized records from local SQLite database.`
        );
        loadData();
      } catch (err) {
        console.error('Failed to purge:', err);
        Alert.alert('Purge Error', 'An error occurred during database purging.');
      } finally {
        setPurging(false);
      }
    }, 1000);
  };

  const renderLogItem = ({ item }: { item: AttendanceLog }) => {
    const formattedDate = new Date(item.timestamp).toLocaleString();

    return (
      <View style={styles.logCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.empId}>Employee ID: <Text style={styles.empIdVal}>{item.employee_id}</Text></Text>
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>{item.sync_status}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.timestamp}>{formattedDate}</Text>
          <Text style={styles.statusLabel}>{item.status}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0E12" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Pending Sync Queue</Text>
        <Text style={styles.subtitle}>Manage local records awaiting AWS Cloud upload</Text>
      </View>

      {/* Stats Summary Card */}
      <View style={styles.statsSummary}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{pendingLogs.length}</Text>
          <Text style={styles.summaryLabel}>Awaiting Sync</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#00FF66' }]}>{syncedCount}</Text>
          <Text style={styles.summaryLabel}>Synced (Awaiting Purge)</Text>
        </View>
      </View>

      {/* Action Simulation Buttons */}
      <View style={styles.actionsGroup}>
        {pendingLogs.length > 0 && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.syncBtn, syncing && styles.btnDisabled]}
            onPress={handleSyncSimulation}
            disabled={syncing || purging}
          >
            {syncing ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>☁ Simulate AWS Cloud Sync</Text>
            )}
          </TouchableOpacity>
        )}

        {syncedCount > 0 && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.purgeBtn, purging && styles.btnDisabled]}
            onPress={handlePurgeSimulation}
            disabled={syncing || purging}
          >
            {purging ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.actionBtnText}>🧹 Purge Synced Records</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Main Content */}
      {loading ? (
        <ActivityIndicator size="large" color="#4B7BFF" style={styles.loader} />
      ) : pendingLogs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.successIconCircle}>
            <Text style={styles.successIcon}>✓</Text>
          </View>
          <Text style={styles.emptyText}>All records synchronized</Text>
          <Text style={styles.emptySubtext}>
            {syncedCount > 0
              ? `All pending logs have been uploaded! You have ${syncedCount} synchronized logs waiting to be purged from local SQLite.`
              : 'There are no pending local attendance records. Your database is fully synchronized.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={pendingLogs}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
    paddingHorizontal: 20,
  },
  header: {
    marginTop: 24,
    marginBottom: 16,
  },
  backButton: {
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backText: {
    color: '#4B7BFF',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#8A8F9E',
    marginTop: 4,
  },
  statsSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#161820',
    borderWidth: 1,
    borderColor: '#242736',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFCC00',
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A8F9E',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionsGroup: {
    marginBottom: 20,
    gap: 10,
  },
  actionBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  syncBtn: {
    backgroundColor: '#4B7BFF',
  },
  purgeBtn: {
    backgroundColor: '#FF3366',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 80,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 255, 102, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIcon: {
    color: '#00FF66',
    fontSize: 32,
    fontWeight: '700',
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#8A8F9E',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  listContent: {
    paddingBottom: 24,
  },
  logCard: {
    backgroundColor: '#161820',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#242736',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  empId: {
    color: '#8A8F9E',
    fontSize: 13,
    fontWeight: '500',
  },
  empIdVal: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  statusBadge: {
    backgroundColor: 'rgba(255, 204, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    color: '#FFCC00',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#202330',
    paddingTop: 8,
  },
  timestamp: {
    color: '#8A8F9E',
    fontSize: 11,
  },
  statusLabel: {
    color: '#00FF66',
    fontSize: 11,
    fontWeight: '600',
  },
});
