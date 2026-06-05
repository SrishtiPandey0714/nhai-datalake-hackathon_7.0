// src/screens/RegisterScreen.tsx

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
import { checkEmployeeExists } from '../services/database';

interface RegisterScreenProps {
  onBack: () => void;
  onStartEnrollment: (employeeId: string, name: string) => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({
  onBack,
  onStartEnrollment,
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleProceed = () => {
    Keyboard.dismiss();
    
    const trimmedId = employeeId.trim();
    const trimmedName = name.trim();

    if (!trimmedId) {
      Alert.alert('Validation Error', 'Please enter a valid Employee ID.');
      return;
    }

    if (!trimmedName) {
      Alert.alert('Validation Error', 'Please enter the Employee Name.');
      return;
    }

    // Alphanumeric validation for Employee ID
    const alphanumericRegex = /^[a-zA-Z0-9_\-]+$/;
    if (!alphanumericRegex.test(trimmedId)) {
      Alert.alert(
        'Validation Error',
        'Employee ID must be alphanumeric (letters, numbers, underscores, and dashes only).'
      );
      return;
    }

    setLoading(true);
    
    // Asynchronously perform local SQLite constraint checks
    setTimeout(() => {
      try {
        const exists = checkEmployeeExists(trimmedId);
        if (exists) {
          Alert.alert(
            'Duplicate ID Found',
            `Employee ID "${trimmedId}" is already registered. Please use a unique ID.`
          );
          setLoading(false);
          return;
        }

        // Successfully validated: launch the enrollment scanner
        setLoading(false);
        onStartEnrollment(trimmedId, trimmedName);
      } catch (error) {
        console.error('Error validation employee uniqueness:', error);
        Alert.alert('Database Error', 'Could not verify ID uniqueness. Please try again.');
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
            <Text style={styles.title}>Registration</Text>
            <Text style={styles.subtitle}>Register biometric security credentials</Text>
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

            <Text style={styles.label}>Employee Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Vikram Sharma"
              placeholderTextColor="#555866"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.disabledButton]}
              onPress={handleProceed}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Validating...' : 'Proceed to Capture'}
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
