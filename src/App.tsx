// src/App.tsx

import React, { useState, useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { VerifyIDScreen } from './screens/VerifyIDScreen';
import { CameraScreen } from './screens/CameraScreen';
import { AttendanceHistoryScreen } from './screens/AttendanceHistoryScreen';
import { SyncQueueScreen } from './screens/SyncQueueScreen';
import { initDatabase } from './services/database';

type ScreenName = 'home' | 'register' | 'verify' | 'camera' | 'history' | 'syncQueue';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenName>('home');
  const [enrollmentDetails, setEnrollmentDetails] = useState<{ employeeId: string; name: string } | null>(null);
  const [cameraMode, setCameraMode] = useState<'enrollment' | 'verification'>('enrollment');

  // Initialize the database tables on application mount
  useEffect(() => {
    try {
      initDatabase();
    } catch (error) {
      console.error('Failed to initialize database on mount:', error);
    }
  }, []);

  const navigateToHome = () => {
    setCurrentScreen('home');
  };

  const navigateToRegister = () => {
    setCurrentScreen('register');
  };

  const navigateToVerify = () => {
    setCurrentScreen('verify');
  };

  const navigateToHistory = () => {
    setCurrentScreen('history');
  };

  const navigateToSyncQueue = () => {
    setCurrentScreen('syncQueue');
  };

  const startEnrollment = (employeeId: string, name: string) => {
    setEnrollmentDetails({ employeeId, name });
    setCameraMode('enrollment');
    setCurrentScreen('camera');
  };

  const startVerification = (employeeId: string, name: string) => {
    setEnrollmentDetails({ employeeId, name });
    setCameraMode('verification');
    setCurrentScreen('camera');
  };

  if (currentScreen === 'register') {
    return (
      <RegisterScreen 
        onBack={navigateToHome} 
        onStartEnrollment={startEnrollment} 
      />
    );
  }

  if (currentScreen === 'verify') {
    return (
      <VerifyIDScreen 
        onBack={navigateToHome} 
        onStartVerification={startVerification} 
      />
    );
  }

  if (currentScreen === 'camera') {
    return (
      <CameraScreen
        mode={cameraMode}
        employeeId={enrollmentDetails?.employeeId}
        name={enrollmentDetails?.name}
        onClose={navigateToHome}
        onEnrollSuccess={navigateToHome}
      />
    );
  }

  if (currentScreen === 'history') {
    return (
      <AttendanceHistoryScreen
        onBack={navigateToHome}
      />
    );
  }

  if (currentScreen === 'syncQueue') {
    return (
      <SyncQueueScreen
        onBack={navigateToHome}
      />
    );
  }

  return (
    <HomeScreen 
      onNavigateToRegister={navigateToRegister} 
      onNavigateToVerify={navigateToVerify}
      onNavigateToHistory={navigateToHistory}
      onNavigateToSyncQueue={navigateToSyncQueue}
    />
  );
}
