import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Platform,
} from 'react-native';
import {
  ShieldCheck,
  Users,
  Ambulance,
  Radio,
  Check,
  X,
  Activity,
  Layers,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react-native';
import { useMobileAuth } from '../../context/AuthContext.js';
import { apiClient } from '../../services/api.js';

interface SystemHealthData {
  status: string;
  timestamp: string;
  architecture: string;
  counts: {
    totalUsers: number;
    totalDrivers: number;
    approvedDrivers: number;
    pendingDrivers: number;
    totalAmbulances: number;
    totalTrips: number;
    totalSignals: number;
  };
}

interface DriverAppItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  licenseNumber: string;
  status: string;
  applicationStatus: string;
  vehicleTypeRequested?: string;
  assignedAmbulance?: {
    registrationNumber: string;
    type: string;
  } | null;
  createdAt: string;
}

export const AdminDashboard: React.FC = () => {
  const { user } = useMobileAuth();

  const [healthData, setHealthData] = useState<SystemHealthData | null>(null);
  const [driverApps, setDriverApps] = useState<DriverAppItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchAdminData = async () => {
    try {
      const [healthRes, appsRes] = await Promise.allSettled([
        apiClient.get<SystemHealthData>('/api/v1/admin/system-health'),
        apiClient.get<DriverAppItem[]>('/api/v1/admin/drivers/applications'),
      ]);

      if (healthRes.status === 'fulfilled' && healthRes.value.data) {
        setHealthData(healthRes.value.data);
      }

      if (appsRes.status === 'fulfilled' && appsRes.value.data) {
        setDriverApps(appsRes.value.data);
      }
    } catch {
      // retain state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAdminData();
  };

  const handleApproveDriver = async (id: string, name: string) => {
    setActionLoadingId(id);
    try {
      await apiClient.post(`/api/v1/admin/drivers/${id}/approve`, {});
      Alert.alert('Driver Approved', `${name} is now approved and eligible for emergency dispatches.`);
      fetchAdminData();
    } catch (err: any) {
      Alert.alert('Approval Error', err.message || 'Could not approve driver.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectDriver = async (id: string, name: string) => {
    Alert.prompt
      ? Alert.prompt(
          'Reject Application',
          `Enter rejection reason for ${name}:`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Reject',
              style: 'destructive',
              onPress: async (reason) => {
                if (!reason || reason.trim().length < 3) {
                  Alert.alert('Error', 'A valid reason is required.');
                  return;
                }
                setActionLoadingId(id);
                try {
                  await apiClient.post(`/api/v1/admin/drivers/${id}/reject`, {
                    reason: reason.trim(),
                  });
                  fetchAdminData();
                } catch (e: any) {
                  Alert.alert('Rejection Error', e.message);
                } finally {
                  setActionLoadingId(null);
                }
              },
            },
          ],
          'plain-text',
          'Document verification failed'
        )
      : Alert.alert('Reject Application', `Reject application for ${name}?`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reject',
            style: 'destructive',
            onPress: async () => {
              setActionLoadingId(id);
              try {
                await apiClient.post(`/api/v1/admin/drivers/${id}/reject`, {
                  reason: 'Document verification failed or incomplete credentials.',
                });
                fetchAdminData();
              } catch (e: any) {
                Alert.alert('Rejection Error', e.message);
              } finally {
                setActionLoadingId(null);
              }
            },
          },
        ]);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading System Administrator Console...</Text>
      </View>
    );
  }

  const pendingApps = driverApps.filter((d) => d.applicationStatus === 'PENDING_REVIEW');

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
    >
      {/* Admin Identity Header */}
      <View style={styles.card}>
        <View style={styles.adminHeader}>
          <View style={styles.adminAvatar}>
            <ShieldCheck size={26} color="#3b82f6" />
          </View>
          <View style={styles.adminMeta}>
            <Text style={styles.adminName}>{user?.name || 'Central EMS Administrator'}</Text>
            <Text style={styles.adminSub}>Role: ADMIN &bull; Full Monorepo Supervision</Text>
            <Text style={styles.systemStatusText}>System Status: {healthData?.status || 'HEALTHY'}</Text>
          </View>
        </View>
      </View>

      {/* Real Backend Key Metrics KPI Grid */}
      <Text style={styles.sectionHeaderTitle}>Live Backend Infrastructure Metrics</Text>
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <Users size={18} color="#60a5fa" />
          <Text style={styles.kpiValue}>{healthData?.counts?.totalUsers ?? '-'}</Text>
          <Text style={styles.kpiLabel}>Total Users</Text>
        </View>
        <View style={styles.kpiCard}>
          <Ambulance size={18} color="#38bdf8" />
          <Text style={styles.kpiValue}>{healthData?.counts?.totalAmbulances ?? '-'}</Text>
          <Text style={styles.kpiLabel}>Ambulances</Text>
        </View>
        <View style={styles.kpiCard}>
          <Activity size={18} color="#34d399" />
          <Text style={styles.kpiValue}>{healthData?.counts?.totalTrips ?? '-'}</Text>
          <Text style={styles.kpiLabel}>Total Trips</Text>
        </View>
        <View style={styles.kpiCard}>
          <Radio size={18} color="#f59e0b" />
          <Text style={styles.kpiValue}>{healthData?.counts?.totalSignals ?? '-'}</Text>
          <Text style={styles.kpiLabel}>Smart Signals</Text>
        </View>
      </View>

      {/* DRIVER ONBOARDING APPLICATIONS */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeaderTitle}>
          Driver Onboarding Approvals ({pendingApps.length} Pending)
        </Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <RefreshCw size={13} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {pendingApps.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>All Driver Applications Reviewed</Text>
          <Text style={styles.emptyDesc}>
            No driver registration profiles are currently awaiting administrative vetting.
          </Text>
        </View>
      ) : (
        pendingApps.map((app) => (
          <View key={app.id} style={styles.driverAppCard}>
            <View style={styles.driverAppHeader}>
              <View>
                <Text style={styles.driverAppName}>{app.name}</Text>
                <Text style={styles.driverAppEmail}>{app.email}</Text>
                <Text style={styles.driverAppLicense}>License: {app.licenseNumber}</Text>
                {app.vehicleTypeRequested && (
                  <Text style={styles.requestedVehicle}>
                    Requested: {app.vehicleTypeRequested}
                  </Text>
                )}
              </View>
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingBadgeText}>PENDING</Text>
              </View>
            </View>

            <View style={styles.appActionRow}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => handleRejectDriver(app.id, app.name)}
                disabled={actionLoadingId === app.id}
                activeOpacity={0.8}
              >
                <X size={15} color="#f87171" />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.approveBtn}
                onPress={() => handleApproveDriver(app.id, app.name)}
                disabled={actionLoadingId === app.id}
                activeOpacity={0.8}
              >
                {actionLoadingId === app.id ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Check size={15} color="#ffffff" />
                    <Text style={styles.approveBtnText}>Approve & Activate</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090b',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090b',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 12,
  },
  card: {
    backgroundColor: '#18181b',
    borderRadius: 16,
    padding: 16,
    borderColor: '#27272a',
    borderWidth: 1,
  },
  adminHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adminAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderWidth: 1,
  },
  adminMeta: {
    flex: 1,
  },
  adminName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  adminSub: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
  },
  systemStatusText: {
    fontSize: 10,
    color: '#34d399',
    fontWeight: '700',
    marginTop: 3,
  },
  sectionHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#a1a1aa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshBtn: {
    padding: 6,
    backgroundColor: '#18181b',
    borderRadius: 8,
    borderColor: '#27272a',
    borderWidth: 1,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    marginTop: 6,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#71717a',
    fontWeight: '600',
    marginTop: 2,
  },
  emptyCard: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
  },
  emptyDesc: {
    fontSize: 11,
    color: '#71717a',
    marginTop: 4,
    textAlign: 'center',
  },
  driverAppCard: {
    backgroundColor: '#18181b',
    borderColor: '#27272a',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  driverAppHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  driverAppName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
  },
  driverAppEmail: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 1,
  },
  driverAppLicense: {
    fontSize: 11,
    color: '#cbd5e1',
    marginTop: 2,
  },
  requestedVehicle: {
    fontSize: 10,
    color: '#38bdf8',
    fontWeight: '700',
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#f59e0b',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  pendingBadgeText: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '800',
  },
  appActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopColor: '#27272a',
    borderTopWidth: 1,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    height: 40,
  },
  rejectBtnText: {
    color: '#f87171',
    fontSize: 12,
    fontWeight: '700',
  },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    height: 40,
  },
  approveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
});
