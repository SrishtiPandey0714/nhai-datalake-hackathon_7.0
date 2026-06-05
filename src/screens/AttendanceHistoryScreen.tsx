// src/screens/AttendanceHistoryScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { getAttendanceLogsWithNames, ExtendedAttendanceLog } from '../services/database';

interface AttendanceHistoryScreenProps {
  onBack: () => void;
}

export const AttendanceHistoryScreen: React.FC<AttendanceHistoryScreenProps> = ({
  onBack,
}) => {
  const [logs, setLogs] = useState<ExtendedAttendanceLog[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = () => {
    setLoading(true);
    try {
      const dbLogs = getAttendanceLogsWithNames(searchQuery, 100);
      setLogs(dbLogs);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [searchQuery]);

  const handleRefresh = () => {
    fetchLogs();
  };

  const renderLogItem = ({ item }: { item: ExtendedAttendanceLog }) => {
    const formattedDate = new Date(item.timestamp).toLocaleString();
    const isSuccess = item.status === 'PRESENT' || item.status.toLowerCase() === 'success';

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <Text style={styles.employeeName}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isSuccess ? 'rgba(0, 255, 102, 0.12)' : 'rgba(255, 51, 102, 0.12)' }]}>
            <Text style={[styles.statusText, { color: isSuccess ? '#00FF66' : '#FF3366' }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={styles.logBody}>
          <Text style={styles.label}>ID: <Text style={styles.value}>{item.employee_id}</Text></Text>
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
      
      {/* Header section */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.subtitle}>Browse and search local offline logs</Text>
      </View>

      {/* Stats and Search controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.statsRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Total Records: {logs.length}</Text>
          </View>
          <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
            <Text style={styles.refreshText}>↻ Refresh</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.searchInput}
          placeholder="Search by Employee ID..."
          placeholderTextColor="#555866"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="characters"
          autoCorrect={false}
        />
      </View>

      {/* Main List */}
      {loading ? (
        <ActivityIndicator size="large" color="#4B7BFF" style={styles.loader} />
      ) : logs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No attendance records yet</Text>
          <Text style={styles.emptySubtext}>
            {searchQuery 
              ? `No records found matching Employee ID "${searchQuery}". Try a different ID.` 
              : "Verify a registered employee's face using 'Mark Attendance' to log their attendance here."}
          </Text>
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
    marginBottom: 20,
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
  controlsContainer: {
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: 'rgba(75, 123, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  badgeText: {
    color: '#4B7BFF',
    fontSize: 12,
    fontWeight: '700',
  },
  refreshButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#161820',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#242736',
  },
  refreshText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: '#161820',
    borderColor: '#242736',
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 14,
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
  emptyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  employeeName: {
    color: '#FFFFFF',
    fontSize: 15,
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
  logBody: {
    marginTop: 8,
  },
  label: {
    color: '#8A8F9E',
    fontSize: 12,
  },
  value: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  logFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#202330',
    paddingTop: 8,
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
});
