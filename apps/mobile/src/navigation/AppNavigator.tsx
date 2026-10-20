import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LogOut, Settings, ShieldAlert, User } from 'lucide-react-native';
import { UserRole } from '@aurangabad-ambulance/shared';
import { useMobileAuth } from '../context/AuthContext.js';
import { LoginScreen } from '../screens/auth/LoginScreen.js';
import { RegisterScreen } from '../screens/auth/RegisterScreen.js';
import { PatientDashboard } from '../screens/patient/PatientDashboard.js';
import { DriverDashboard } from '../screens/driver/DriverDashboard.js';
import { TrafficPoliceDashboard } from '../screens/traffic/TrafficPoliceDashboard.js';
import { HospitalStaffDashboard } from '../screens/hospital/HospitalStaffDashboard.js';
import { AdminDashboard } from '../screens/admin/AdminDashboard.js';
import { DiagnosticsScreen } from '../screens/diagnostics/DiagnosticsScreen.js';

export const AppNavigator: React.FC = () => {
  const { user, role, isLoading, logout } = useMobileAuth();
  const [currentAuthView, setCurrentAuthView] = useState<'LOGIN' | 'REGISTER' | 'SETTINGS'>('LOGIN');
  const [showAuthenticatedSettings, setShowAuthenticatedSettings] = useState<boolean>(false);

  // 1. Session Loading State
  if (isLoading) {
    return (
      <SafeAreaView style={styles.splashContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#09090b" />
        <View style={styles.splashContent}>
          <View style={styles.splashBadge}>
            <ShieldAlert size={36} color="#ef4444" />
          </View>
          <Text style={styles.splashTitle}>Aurangabad Smart Ambulance</Text>
          <Text style={styles.splashSubtitle}>Emergency Dispatch Platform</Text>
          <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  // 2. Unauthenticated Flow (Login / Register / Network Diagnostics)
  if (!user) {
    if (currentAuthView === 'REGISTER') {
      return <RegisterScreen onNavigateToLogin={() => setCurrentAuthView('LOGIN')} />;
    }
    if (currentAuthView === 'SETTINGS') {
      return <DiagnosticsScreen onBack={() => setCurrentAuthView('LOGIN')} />;
    }
    return (
      <LoginScreen
        onNavigateToRegister={() => setCurrentAuthView('REGISTER')}
        onOpenSettings={() => setCurrentAuthView('SETTINGS')}
      />
    );
  }

  // 3. In-App Settings / Network Diagnostics (while authenticated)
  if (showAuthenticatedSettings) {
    return (
      <SafeAreaView style={styles.mainContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#09090b" />
        <DiagnosticsScreen onBack={() => setShowAuthenticatedSettings(false)} />
      </SafeAreaView>
    );
  }

  // 4. Authenticated Role-Based View
  const renderRoleDashboard = () => {
    switch (role) {
      case UserRole.PATIENT:
        return <PatientDashboard />;
      case UserRole.DRIVER:
        return <DriverDashboard />;
      case UserRole.TRAFFIC_POLICE:
        return <TrafficPoliceDashboard />;
      case UserRole.HOSPITAL_STAFF:
        return <HospitalStaffDashboard />;
      case UserRole.ADMIN:
        return <AdminDashboard />;
      default:
        return <PatientDashboard />;
    }
  };

  const getRoleBadgeColor = () => {
    switch (role) {
      case UserRole.ADMIN:
        return '#3b82f6';
      case UserRole.DRIVER:
        return '#38bdf8';
      case UserRole.TRAFFIC_POLICE:
        return '#f59e0b';
      case UserRole.HOSPITAL_STAFF:
        return '#10b981';
      case UserRole.PATIENT:
      default:
        return '#ef4444';
    }
  };

  return (
    <SafeAreaView style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />

      {/* Global Authenticated Top Navigation Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.brandingRow}>
            <Text style={styles.brandTitle}>AURANGABAD EMS</Text>
            <View style={[styles.roleBadge, { borderColor: getRoleBadgeColor() }]}>
              <Text style={[styles.roleBadgeText, { color: getRoleBadgeColor() }]}>
                {role || 'PATIENT'}
              </Text>
            </View>
          </View>
          <Text style={styles.userNameText} numberOfLines={1}>
            {user.name} ({user.email})
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={() => setShowAuthenticatedSettings(true)}
            activeOpacity={0.7}
          >
            <Settings size={18} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.headerIconBtn, styles.logoutBtn]}
            onPress={logout}
            activeOpacity={0.7}
          >
            <LogOut size={18} color="#f87171" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Role Dashboard Body */}
      <View style={styles.body}>{renderRoleDashboard()}</View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashContent: {
    alignItems: 'center',
    padding: 24,
  },
  splashBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  splashSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 4,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#18181b',
    borderBottomColor: '#27272a',
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 8,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  userNameText: {
    fontSize: 11,
    color: '#a1a1aa',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  body: {
    flex: 1,
  },
});
