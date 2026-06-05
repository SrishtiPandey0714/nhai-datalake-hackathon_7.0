// src/screens/HomeScreen.tsx

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { 
  getAttendanceLogs, 
  AttendanceLog,
  getRegisteredEmployeeCount,
  getAttendanceRecordCount,
  getPendingSyncCount 
} from '../services/database';

interface HomeScreenProps {
  onNavigateToRegister: () => void;
  onNavigateToVerify: () => void;
  onNavigateToHistory: () => void;
  onNavigateToSyncQueue: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ 
  onNavigateToRegister,
  onNavigateToVerify,
  onNavigateToHistory,
  onNavigateToSyncQueue,
}) => {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    registeredEmployees: 0,
    attendanceRecords: 0,
    pendingSync: 0,
  });

  const fetchLogsAndStats = () => {
    setLoading(true);
    try {
      const dbLogs = getAttendanceLogs(50);
      setLogs(dbLogs);

      const registered = getRegisteredEmployeeCount();
      const attendance = getAttendanceRecordCount();
      const pending = getPendingSyncCount();

      setStats({
        registeredEmployees: registered,
        attendanceRecords: attendance,
        pendingSync: pending,
      });
    } catch (err) {
      console.error('Error fetching logs and stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogsAndStats();
  }, []);

  const renderLogItem = ({ item }: { item: AttendanceLog }) => {
    const formattedDate = new Date(item.timestamp).toLocaleString();
    const isSuccess = item.status === 'PRESENT' || item.status.toLowerCase() === 'success';

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <Text style={styles.logEmpId}>{item.employee_id}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isSuccess ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 51, 102, 0.12)' }]}>
            <Text style={[styles.statusText, { color: isSuccess ? '#00FF66' : '#FF3366' }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.logFooter}>
          <Text style={styles.logTime}>{formattedDate}</Text>
          <Text style={styles.syncStatus}>{item.sync_status}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0E12" />
      
      {/* Premium Header */}
      <View style={styles.header}>
        <Text style={styles.appName}>NHAI FACIAL AUTH</Text>
        <Text style={styles.subHeader}>Offline Biometric System</Text>
      </View>

      {/* Dashboard Statistics */}
      <View style={styles.statsDashboard}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.registeredEmployees}</Text>
          <Text style={styles.statLabel}>Registered{"\n"}Employees</Text>
        </View>
        
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.attendanceRecords}</Text>
          <Text style={styles.statLabel}>Attendance{"\n"}Records</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: stats.pendingSync > 0 ? '#FFCC00' : '#4B7BFF' }]}>
            {stats.pendingSync}
          </Text>
          <Text style={styles.statLabel}>Pending{"\n"}Sync Queue</Text>
        </View>
      </View>

      {/* Main Actions Panel */}
      <View style={styles.actionsContainer}>
        <Text style={styles.sectionTitle}>Registration & Entry</Text>
        <TouchableOpacity style={styles.actionButton} onPress={onNavigateToRegister}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>+</Text>
          </View>
          <View style={styles.actionDetails}>
            <Text style={styles.actionTitle}>Register Employee</Text>
            <Text style={styles.actionDesc}>Capture 5 diverse face templates</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={onNavigateToVerify}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>✓</Text>
          </View>
          <View style={styles.actionDetails}>
            <Text style={styles.actionTitle}>Mark Attendance</Text>
            <Text style={styles.actionDesc}>1-to-1 face verification</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={onNavigateToHistory}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>📋</Text>
          </View>
          <View style={styles.actionDetails}>
            <Text style={styles.actionTitle}>View Attendance Logs</Text>
            <Text style={styles.actionDesc}>Browse, search, and refresh history</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.actionButton} 
          onPress={onNavigateToSyncQueue}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>🔄</Text>
          </View>
          <View style={styles.actionDetails}>
            <Text style={styles.actionTitle}>Pending Sync Queue</Text>
            <Text style={styles.actionDesc}>Awaiting cloud synchronization</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Local Logs List */}
      <View style={styles.logsContainer}>
        <View style={styles.logsHeaderContainer}>
          <Text style={styles.sectionTitle}>Recent Attendance Logs</Text>
          <TouchableOpacity onPress={fetchLogsAndStats} style={styles.refreshButton}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#4B7BFF" style={styles.loader} />
        ) : logs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No attendance logs stored locally</Text>
            <Text style={styles.emptySubtext}>Perform verification scanning to log logs</Text>
          </View>
        ) : (
          <FlatList
            data={logs}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderLogItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
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
    marginBottom: 28,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  subHeader: {
    fontSize: 13,
    color: '#8A8F9E',
    marginTop: 4,
    fontWeight: '500',
  },
  actionsContainer: {
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161820',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#242736',
  },
  disabledButton: {
    opacity: 0.5,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4B7BFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  disabledCircle: {
    backgroundColor: '#3E4257',
  },
  iconText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  actionDetails: {
    flex: 1,
  },
  actionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  actionDesc: {
    color: '#8A8F9E',
    fontSize: 12,
    marginTop: 2,
  },
  logsContainer: {
    flex: 1,
    backgroundColor: '#161820',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#242736',
    padding: 16,
    marginBottom: 20,
  },
  logsHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  refreshButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  refreshText: {
    color: '#4B7BFF',
    fontSize: 13,
    fontWeight: '600',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#8A8F9E',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 8,
  },
  logCard: {
    backgroundColor: '#0D0E12',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#202330',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logEmpId: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  logFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  logTime: {
    color: '#8A8F9E',
    fontSize: 11,
  },
  syncStatus: {
    color: '#FFCC00',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  statsDashboard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#161820',
    borderWidth: 1,
    borderColor: '#242736',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4B7BFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8A8F9E',
    textAlign: 'center',
    lineHeight: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
