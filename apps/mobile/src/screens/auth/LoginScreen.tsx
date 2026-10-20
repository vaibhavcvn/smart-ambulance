import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { ShieldAlert, LogIn, UserPlus, Server, KeyRound, Mail, AlertCircle } from 'lucide-react-native';
import { useMobileAuth } from '../../context/AuthContext.js';
import { mobileConfig } from '../../config/env.js';

interface LoginScreenProps {
  onNavigateToRegister: () => void;
  onOpenSettings: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onNavigateToRegister,
  onOpenSettings,
}) => {
  const { login } = useMobileAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Quick helper to fill standard demo credentials for testing
  const fillPreset = (presetEmail: string, presetPass: string) => {
    setEmail(presetEmail);
    setPassword(presetPass);
    setErrorMessage(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#09090b" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Top Bar with Server IP Status */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.serverChip} onPress={onOpenSettings} activeOpacity={0.8}>
              <Server size={12} color="#3b82f6" />
              <Text style={styles.serverChipText} numberOfLines={1}>
                {mobileConfig.apiUrl}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Hero Branding */}
          <View style={styles.heroSection}>
            <View style={styles.badge}>
              <ShieldAlert size={14} color="#ef4444" />
              <Text style={styles.badgeText}>SMART DISPATCH PLATFORM</Text>
            </View>
            <Text style={styles.heroTitle}>Aurangabad EMS</Text>
            <Text style={styles.heroSubtitle}>
              Intelligent Emergency Ambulance Dispatch & Traffic Corridor Coordination
            </Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardDesc}>Access role-based emergency portal</Text>

            {errorMessage && (
              <View style={styles.errorBox}>
                <AlertCircle size={16} color="#f87171" style={styles.errorIcon} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Mail size={16} color="#71717a" style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="name@aurangabad.gov.in"
                  placeholderTextColor="#52525b"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputWrapper}>
                <KeyRound size={16} color="#71717a" style={styles.fieldIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="••••••••"
                  placeholderTextColor="#52525b"
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <LogIn size={16} color="#ffffff" />
                  <Text style={styles.loginButtonText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={onNavigateToRegister}
              activeOpacity={0.8}
            >
              <UserPlus size={16} color="#93c5fd" />
              <Text style={styles.registerButtonText}>Register as Citizen / Patient</Text>
            </TouchableOpacity>
          </View>

          {/* Quick Role Fill Presets (Convenience during development & testing) */}
          <View style={styles.presetSection}>
            <Text style={styles.presetHeading}>ROLE TEST ACCOUNTS</Text>
            <View style={styles.presetGrid}>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => fillPreset('admin@aurangabad.gov.in', 'Admin@12345')}
              >
                <Text style={styles.presetRole}>ADMIN</Text>
                <Text style={styles.presetEmail}>admin@aurangabad.gov.in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => fillPreset('driver1@aurangabad.gov.in', 'Driver@12345')}
              >
                <Text style={styles.presetRole}>DRIVER</Text>
                <Text style={styles.presetEmail}>driver1@aurangabad.gov.in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => fillPreset('ghati.staff@aurangabad.gov.in', 'Staff@12345')}
              >
                <Text style={styles.presetRole}>HOSPITAL</Text>
                <Text style={styles.presetEmail}>ghati.staff@...</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => fillPreset('kranti.traffic@aurangabad.gov.in', 'Police@12345')}
              >
                <Text style={styles.presetRole}>TRAFFIC</Text>
                <Text style={styles.presetEmail}>kranti.traffic@...</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  serverChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 240,
  },
  serverChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  heroSection: {
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 1,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  badgeText: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#a1a1aa',
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 18,
    padding: 20,
    borderColor: '#27272a',
    borderWidth: 1,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
  },
  cardDesc: {
    fontSize: 12,
    color: '#71717a',
    marginTop: 2,
    marginBottom: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    color: '#f87171',
    fontSize: 12,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#d4d4d8',
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  fieldIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 44,
    color: '#ffffff',
    fontSize: 14,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    height: 46,
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#27272a',
  },
  dividerText: {
    color: '#71717a',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 10,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    height: 44,
  },
  registerButtonText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '700',
  },
  presetSection: {
    marginTop: 4,
  },
  presetHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#71717a',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
  },
  presetRole: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38bdf8',
    marginBottom: 2,
  },
  presetEmail: {
    fontSize: 11,
    color: '#a1a1aa',
  },
});
