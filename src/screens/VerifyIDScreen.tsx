// src/screens/VerifyIDScreen.tsx

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
} from 'react-native';
import { getEmployeeById } from '../services/database';

interface VerifyIDScreenProps {
  onBack: () => void;
  onStartVerification: (employeeId: string, name: string) => void;
}

export const VerifyIDScreen: React.FC<VerifyIDScreenProps> = ({
  onBack,
  onStartVerification,
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleProceed = () => {
    Keyboard.dismiss();
    
    const trimmedId = employeeId.trim();

    if (!trimmedId) {
      Alert.alert('Validation Error', 'Please enter a valid Employee ID.');
      return;
    }

    setLoading(true);
    
    // Perform database lookup for employee template
    setTimeout(() => {
      try {
        const employee = getEmployeeById(trimmedId);
        if (!employee) {
          Alert.alert(
            'Employee Not Found',
            `Employee ID "${trimmedId}" is not registered. Please register the employee first.`
          );
          setLoading(false);
          return;
        }

        // ID exists: start verification scanner
        setLoading(false);
        onStartVerification(trimmedId, employee.name);
      } catch (error) {
        console.error('Error validating employee existence:', error);
        Alert.alert('Database Error', 'Could not verify ID. Please try again.');
        setLoading(false);
      }
    }, 100);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0D0E12" />
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <TouchableOpacity onPress={onBack} style={styles.backButton}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Mark Attendance</Text>
            <Text style={styles.subtitle}>Verify biometric security credentials</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Employee ID</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. EMP9810"
              placeholderTextColor="#555866"
              value={employeeId}
              onChangeText={setEmployeeId}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleProceed}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Checking ID...' : 'Proceed to Verify'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0E12',
  },
  keyboardView: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 40,
  },
  backButton: {
    marginBottom: 20,
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
  form: {
    backgroundColor: '#161820',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#242736',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0D0E12',
    borderColor: '#202330',
    borderWidth: 1,
    borderRadius: 12,
    height: 52,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#4B7BFF',
    borderRadius: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#4B7BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
