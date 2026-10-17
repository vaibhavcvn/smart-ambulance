import React, { useState, useEffect } from 'react';
import { SystemKPIs, DriverApplicationStatus } from '@aurangabad-ambulance/shared';
import { api } from '../../lib/api-client.js';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  BarChart3,
  Ambulance,
  Building2,
  Brain,
  ShieldCheck,
  CheckCircle2,
  Users,
  Activity,
  Layers,
  FileCheck,
  UserPlus,
  Radio,
  Clock,
  AlertTriangle,
  XCircle,
  PauseCircle,
  ToggleLeft,
  ToggleRight,
  ShieldAlert,
  Sliders,
  Play,
  Square,
  Navigation,
  Sparkles,
} from 'lucide-react';

export const AdminDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'kpis' | 'drivers' | 'provisioning' | 'signals_audit' | 'demo_controls'>('kpis');

  // Operations Data
  const [kpis, setKpis] = useState<SystemKPIs | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [hospitalOverview, setHospitalOverview] = useState<any[]>([]);
  const [mlDiagnostics, setMlDiagnostics] = useState<any | null>(null);
  const [fleet, setFleet] = useState<any[]>([]);

  // Driver Applications Data
  const [driverApplications, setDriverApplications] = useState<any[]>([]);
  const [selectedDriverForReject, setSelectedDriverForReject] = useState<any | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [driverActionLoading, setDriverActionLoading] = useState<string | null>(null);

  // Provisioning Forms State
  const [hospStaffName, setHospStaffName] = useState('');
  const [hospStaffEmail, setHospStaffEmail] = useState('');
  const [hospStaffPassword, setHospStaffPassword] = useState('');
  const [hospStaffHospitalId, setHospStaffHospitalId] = useState('');
  const [hospStaffDepartment, setHospStaffDepartment] = useState('Emergency Department');
  const [hospStaffSubmitting, setHospStaffSubmitting] = useState(false);
  const [hospStaffMessage, setHospStaffMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [policeOfficerName, setPoliceOfficerName] = useState('');
  const [policeOfficerEmail, setPoliceOfficerEmail] = useState('');
  const [policeOfficerPassword, setPoliceOfficerPassword] = useState('');
  const [policeBadgeNumber, setPoliceBadgeNumber] = useState('');
  const [policeJurisdictionZone, setPoliceJurisdictionZone] = useState('ZONE_CENTRAL_KRANTI');
  const [policeSubmitting, setPoliceSubmitting] = useState(false);
  const [policeMessage, setPoliceMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Signals & Audit Data
  const [signals, setSignals] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any | null>(null);

  // Demo Controls State
  const [demoStatus, setDemoStatus] = useState<any | null>(null);
  const [activeTripsForDemo, setActiveTripsForDemo] = useState<any[]>([]);
  const [simSpeed, setSimSpeed] = useState<number>(40);
  const [simLeadTime, setSimLeadTime] = useState<number>(300);
  const [simRadius, setSimRadius] = useState<number>(0.8);
  const [simStale, setSimStale] = useState<number>(300);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [simActionLoading, setSimActionLoading] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDemoData = async () => {
    try {
      const [statusRes, tripsRes] = await Promise.all([
        api.get<any>('/api/v1/demo/status').catch(() => null),
        api.get<any[]>('/api/v1/demo/active-trips').catch(() => []),
      ]);
      setDemoStatus(statusRes);
      setActiveTripsForDemo(tripsRes);
      if (statusRes?.config?.speedKmh) setSimSpeed(statusRes.config.speedKmh);
      if (statusRes?.proximityConfig?.alertLeadTimeSeconds) setSimLeadTime(statusRes.proximityConfig.alertLeadTimeSeconds);
      if (statusRes?.proximityConfig?.proximityAlertRadiusKm) setSimRadius(statusRes.proximityConfig.proximityAlertRadiusKm);
      if (statusRes?.proximityConfig?.officerGpsStaleSeconds) setSimStale(statusRes.proximityConfig.officerGpsStaleSeconds);
    } catch (err) {
      console.warn('Error loading demo controls data:', err);
    }
  };

  const handleSaveDemoConfig = async () => {
    setIsSavingConfig(true);
    setConfigMessage(null);
    try {
      await api.patch('/api/v1/demo/config', {
        speedKmh: simSpeed,
        alertLeadTimeSeconds: simLeadTime,
        proximityAlertRadiusKm: simRadius,
        officerGpsStaleSeconds: simStale,
      });
      setConfigMessage({ type: 'success', text: 'Simulator configuration updated successfully.' });
      await loadDemoData();
    } catch (err: any) {
      setConfigMessage({ type: 'error', text: err?.message || 'Failed to update simulator configuration.' });
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleStartSim = async (tripId: string) => {
    setSimActionLoading(tripId);
    try {
      await api.post(`/api/v1/demo/start/${tripId}`, {});
      await loadDemoData();
    } catch (err: any) {
      alert(err?.message || 'Failed to start demo simulation.');
    } finally {
      setSimActionLoading(null);
    }
  };

  const handleStopSim = async (tripId: string) => {
    setSimActionLoading(tripId);
    try {
      await api.post(`/api/v1/demo/stop/${tripId}`, {});
      await loadDemoData();
    } catch (err: any) {
      alert(err?.message || 'Failed to stop demo simulation.');
    } finally {
      setSimActionLoading(null);
    }
  };

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadAllData = async () => {
    try {
      const [kpiRes, chartRes, hospRes, mlRes, fleetRes, driversRes, signalsRes, auditRes, healthRes] =
        await Promise.all([
          api.get<SystemKPIs>('/api/v1/analytics/kpis'),
          api.get<any[]>('/api/v1/analytics/charts'),
          api.get<any[]>('/api/v1/analytics/hospital-overview'),
          api.get<any>('/api/v1/ml/metrics'),
          api.get<any[]>('/api/v1/tracking/fleet'),
          api.get<any[]>('/api/v1/admin/drivers/applications').catch(() => []),
          api.get<any[]>('/api/v1/admin/signals').catch(() => []),
          api.get<any[]>('/api/v1/admin/audit-logs').catch(() => []),
          api.get<any>('/api/v1/admin/system-health').catch(() => null),
        ]);

      setKpis(kpiRes);
      setChartData(chartRes);
      setHospitalOverview(hospRes);
      setMlDiagnostics(mlRes);
      setFleet(fleetRes);
      setDriverApplications(driversRes);
      setSignals(signalsRes);
      setAuditLogs(auditRes);
      setSystemHealth(healthRes);

      if (hospRes.length > 0 && !hospStaffHospitalId) {
        setHospStaffHospitalId(hospRes[0].id);
      }
    } catch (err) {
      console.warn('Error loading admin analytics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Driver Actions
  const handleApproveDriver = async (driverId: string) => {
    setDriverActionLoading(driverId);
    try {
      await api.post(`/api/v1/admin/drivers/${driverId}/approve`, {});
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    } finally {
      setDriverActionLoading(null);
    }
  };

  const handleConfirmRejectDriver = async () => {
    if (!selectedDriverForReject || !rejectionReason.trim()) return;
    setDriverActionLoading(selectedDriverForReject.id);
    try {
      await api.post(`/api/v1/admin/drivers/${selectedDriverForReject.id}/reject`, {
        reason: rejectionReason.trim(),
      });
      setSelectedDriverForReject(null);
      setRejectionReason('');
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Rejection failed');
    } finally {
      setDriverActionLoading(null);
    }
  };

  const handleSuspendDriver = async (driverId: string) => {
    if (!confirm('Are you sure you want to suspend this driver? All active dispatch permissions will be revoked immediately.')) {
      return;
    }
    setDriverActionLoading(driverId);
    try {
      await api.post(`/api/v1/admin/drivers/${driverId}/suspend`, {});
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Suspension failed');
    } finally {
      setDriverActionLoading(null);
    }
  };

  // Staff Provisioning Handlers
  const handleProvisionHospitalStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setHospStaffSubmitting(true);
    setHospStaffMessage(null);

    try {
      await api.post('/api/v1/admin/hospitals/provision-staff', {
        name: hospStaffName.trim(),
        email: hospStaffEmail.trim().toLowerCase(),
        password: hospStaffPassword,
        hospitalId: hospStaffHospitalId,
        department: hospStaffDepartment.trim(),
      });

      setHospStaffMessage({
        type: 'success',
        text: `Hospital staff account for ${hospStaffName} provisioned successfully!`,
      });
      setHospStaffName('');
      setHospStaffEmail('');
      setHospStaffPassword('');
      loadAllData();
    } catch (err: any) {
      setHospStaffMessage({
        type: 'error',
        text: err.message || 'Provisioning failed. Email may already be registered.',
      });
    } finally {
      setHospStaffSubmitting(false);
    }
  };

  const handleProvisionPoliceOfficer = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoliceSubmitting(true);
    setPoliceMessage(null);

    try {
      await api.post('/api/v1/admin/traffic/provision-officer', {
        name: policeOfficerName.trim(),
        email: policeOfficerEmail.trim().toLowerCase(),
        password: policeOfficerPassword,
        badgeNumber: policeBadgeNumber.trim(),
        jurisdictionZone: policeJurisdictionZone,
      });

      setPoliceMessage({
        type: 'success',
        text: `Traffic police officer account for ${policeOfficerName} provisioned successfully!`,
      });
      setPoliceOfficerName('');
      setPoliceOfficerEmail('');
      setPoliceOfficerPassword('');
      setPoliceBadgeNumber('');
      loadAllData();
    } catch (err: any) {
      setPoliceMessage({
        type: 'error',
        text: err.message || 'Provisioning failed. Email may already be registered.',
      });
    } finally {
      setPoliceSubmitting(false);
    }
  };

  const handleToggleSignal = async (signalId: string) => {
    try {
      await api.patch(`/api/v1/admin/signals/${signalId}/toggle`, {});
      await loadAllData();
    } catch (err: any) {
      alert(err.message || 'Signal toggle failed');
    }
  };

  return (
    <div className="min-h-[calc(100vh-88px)] bg-neutral-950 text-neutral-100 font-sans py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-lg shadow-purple-900/40">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white tracking-tight leading-none">
                  Aurangabad Operations & Analytics Command
                </h1>
                <p className="text-xs text-neutral-400 mt-1">
                  Designated Administrator Console: Live Telemetry, Fleet Oversight, Driver Onboarding & Tenancy Provisioning
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black px-3 py-1 bg-purple-950 text-purple-300 rounded-full border border-purple-800">
              CANONICAL ADMIN
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-800 space-x-2 sm:space-x-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('kpis')}
            className={`py-2.5 px-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'kpis'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Operations & Telemetry</span>
          </button>

          <button
            onClick={() => setActiveTab('drivers')}
            className={`py-2.5 px-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 relative whitespace-nowrap ${
              activeTab === 'drivers'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <FileCheck className="w-4 h-4" />
            <span>Driver Applications</span>
            {driverApplications.filter((d) => d.applicationStatus === 'PENDING_REVIEW').length > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-neutral-950 text-[10px] flex items-center justify-center font-black">
                {driverApplications.filter((d) => d.applicationStatus === 'PENDING_REVIEW').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('provisioning')}
            className={`py-2.5 px-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'provisioning'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Staff Provisioning</span>
          </button>

          <button
            onClick={() => setActiveTab('signals_audit')}
            className={`py-2.5 px-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'signals_audit'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Signals & Audit Logs</span>
          </button>

          <button
            onClick={() => { setActiveTab('demo_controls'); loadDemoData(); }}
            className={`py-2.5 px-3 text-xs font-extrabold border-b-2 transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'demo_controls'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Demo Controls & GPS Simulator</span>
            {demoStatus?.activeSimulations?.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            )}
          </button>
        </div>

      {/* TAB 1: OPERATIONS & TELEMETRY */}
      {activeTab === 'kpis' && (
        <div className="space-y-6">
          {/* KPI METRIC CARDS */}
          {kpis && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold block">Total Bookings</span>
                <span className="text-2xl font-extrabold text-slate-900 block mt-1">{kpis.totalBookings}</span>
                <span className="text-[10px] text-emerald-600 font-bold mt-1 block">Live Database</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold block">Completed Trips</span>
                <span className="text-2xl font-extrabold text-emerald-600 block mt-1">{kpis.completedTrips}</span>
                <span className="text-[10px] text-slate-400 mt-1 block">Handover confirmed</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold block">Active Missions</span>
                <span className="text-2xl font-extrabold text-blue-600 block mt-1">{kpis.activeTrips}</span>
                <span className="text-[10px] text-blue-500 font-bold mt-1 block">Currently En Route</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold block">Ambulances Online</span>
                <span className="text-2xl font-extrabold text-slate-900 block mt-1">
                  {kpis.availableAmbulances} / {kpis.totalAmbulances}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Fleet Readiness</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold block">Dispatch Rate</span>
                <span className="text-2xl font-extrabold text-indigo-600 block mt-1">
                  {kpis.dispatchSuccessRatePercent}%
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Accepted / Offered</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold block">Avg SLA Response</span>
                <span className="text-2xl font-extrabold text-slate-900 block mt-1">
                  {kpis.averageResponseTimeSeconds}s
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">Request to Accept</span>
              </div>
            </div>
          )}

          {/* CHARTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-red-600" />
                <span>Emergency Trip Volume by Time of Day (Aurangabad)</span>
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="critical" name="Critical (ALS)" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="urgent" name="Urgent" fill="#d97706" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="standard" name="Standard (BLS)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" />
                <span>Hospital Emergency & ICU Bed Capacity</span>
              </h2>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hospitalOverview}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="emergencyBeds" name="ER Beds" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="icuBeds" name="ICU Beds" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ML DIAGNOSTICS */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Brain className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Machine Learning Subsystem — Random Forest Delay Predictor
                  </h2>
                  <span className="text-xs text-slate-500 font-medium">
                    Pure TypeScript/Node.js implementation (ml-random-forest). Zero Python runtime dependency.
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200">
                {mlDiagnostics?.version || 'v1.0.0-rf-aurangabad'}
              </span>
            </div>

            {mlDiagnostics?.metrics ? (
              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-semibold block">MAE (Test Set)</span>
                    <span className="text-xl font-black text-slate-900 block mt-0.5">
                      {mlDiagnostics.metrics.maeSeconds} sec
                    </span>
                    <span className="text-[10px] text-slate-400">Mean Absolute Error</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-semibold block">RMSE (Test Set)</span>
                    <span className="text-xl font-black text-slate-900 block mt-0.5">
                      {mlDiagnostics.metrics.rmseSeconds} sec
                    </span>
                    <span className="text-[10px] text-slate-400">Root Mean Squared Error</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-semibold block">R² Score</span>
                    <span className="text-xl font-black text-emerald-600 block mt-0.5">
                      {mlDiagnostics.metrics.r2Score}
                    </span>
                    <span className="text-[10px] text-slate-400">Variance Explained</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs text-slate-500 font-semibold block">Baseline MAE</span>
                    <span className="text-xl font-black text-slate-600 block mt-0.5">
                      {mlDiagnostics.metrics.baselineMaeSeconds} sec
                    </span>
                    <span className="text-[10px] text-slate-400">Mean-prediction baseline</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <span className="font-bold text-slate-800 block mb-1">Feature Schema (7 inputs):</span>
                    <div className="flex flex-wrap gap-1">
                      {mlDiagnostics.features?.map((f: string) => (
                        <span key={f} className="bg-white px-2 py-0.5 rounded border border-slate-300 font-mono text-[11px]">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="font-bold text-slate-800 block mb-1">Training Provenance:</span>
                    <p className="text-slate-600">
                      Trained on {mlDiagnostics.trainingSamplesCount} synthetic Aurangabad urban emergency
                      transit profiles with {mlDiagnostics.testSamplesCount} held-out validation records.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                Model currently uninitialized or metadata loading.
              </div>
            )}
          </div>

          {/* FLEET TELEMETRY TABLE */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Ambulance className="w-5 h-5 text-blue-600" />
              <span>Fleet Registry & Live Telemetry Mode</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-100">
                <thead>
                  <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5">Vehicle</th>
                    <th className="py-2.5">Type</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5">Assigned Driver</th>
                    <th className="py-2.5">Current GPS</th>
                    <th className="py-2.5">Telemetry Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fleet.map((amb) => (
                    <tr key={amb.id} className="hover:bg-slate-50">
                      <td className="py-3 font-bold text-slate-900">{amb.registrationNumber}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            amb.type === 'ALS' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {amb.type}
                        </span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold ${
                            amb.status === 'AVAILABLE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {amb.status}
                        </span>
                      </td>
                      <td className="py-3 text-slate-700 font-medium">{amb.driverName}</td>
                      <td className="py-3 font-mono text-slate-500 text-[11px]">
                        {amb.latitude.toFixed(4)}, {amb.longitude.toFixed(4)}
                      </td>
                      <td className="py-3">
                        {amb.isSimulated ? (
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded font-bold text-[10px] uppercase">
                            DEMO GPS (SIMULATED)
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded font-bold text-[10px] uppercase">
                            REAL DEVICE GPS
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DRIVER APPLICATIONS */}
      {activeTab === 'drivers' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Driver Application & Authorization Review</h2>
              <p className="text-xs text-slate-500">
                Review applicant licenses and assign ambulances. Unapproved applicants cannot receive dispatch offers or submit GPS updates.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
              Total Applicants: {driverApplications.length}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-100">
              <thead>
                <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5">Applicant Name</th>
                  <th className="py-2.5">Email & Phone</th>
                  <th className="py-2.5">Commercial License</th>
                  <th className="py-2.5">Requested Vehicle</th>
                  <th className="py-2.5">Application Status</th>
                  <th className="py-2.5">Assigned Ambulance</th>
                  <th className="py-2.5 text-right">Admin Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {driverApplications.map((driver) => (
                  <tr key={driver.id} className="hover:bg-slate-50">
                    <td className="py-3 font-bold text-slate-900">{driver.name}</td>
                    <td className="py-3 text-slate-600">
                      <div>{driver.email}</div>
                      <div className="text-[11px] text-slate-400">{driver.phone || 'No phone'}</div>
                    </td>
                    <td className="py-3 font-mono font-medium text-slate-800">{driver.licenseNumber}</td>
                    <td className="py-3">
                      <span className="font-semibold text-slate-800">{driver.vehicleTypeRequested || 'ALS'}</span>
                      {driver.vehicleRegistrationRequested && (
                        <div className="text-[11px] font-mono text-slate-500">{driver.vehicleRegistrationRequested}</div>
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                          driver.applicationStatus === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : driver.applicationStatus === 'PENDING_REVIEW'
                            ? 'bg-amber-100 text-amber-900'
                            : driver.applicationStatus === 'SUSPENDED'
                            ? 'bg-purple-100 text-purple-900'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {driver.applicationStatus}
                      </span>
                      {driver.rejectionReason && (
                        <div className="text-[10px] text-red-600 mt-0.5 font-medium">Reason: {driver.rejectionReason}</div>
                      )}
                    </td>
                    <td className="py-3 font-mono text-xs">
                      {driver.assignedAmbulance ? (
                        <span className="font-bold text-blue-700">{driver.assignedAmbulance.registrationNumber}</span>
                      ) : (
                        <span className="text-slate-400 italic">None</span>
                      )}
                    </td>
                    <td className="py-3 text-right space-x-1">
                      {driver.applicationStatus === 'PENDING_REVIEW' && (
                        <>
                          <button
                            onClick={() => handleApproveDriver(driver.id)}
                            disabled={driverActionLoading === driver.id}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setSelectedDriverForReject(driver)}
                            disabled={driverActionLoading === driver.id}
                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {driver.applicationStatus === 'APPROVED' && (
                        <button
                          onClick={() => handleSuspendDriver(driver.id)}
                          disabled={driverActionLoading === driver.id}
                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      )}

                      {driver.applicationStatus === 'SUSPENDED' && (
                        <button
                          onClick={() => handleApproveDriver(driver.id)}
                          disabled={driverActionLoading === driver.id}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-bold transition-colors disabled:opacity-50"
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Rejection Modal */}
          {selectedDriverForReject && (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">
                  Reject Application for {selectedDriverForReject.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Specify a reason for record keeping and applicant notification.
                </p>

                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Commercial driving license is expired or invalid format."
                  className="w-full mt-3 p-2.5 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500 h-24"
                />

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => {
                      setSelectedDriverForReject(null);
                      setRejectionReason('');
                    }}
                    className="px-3 py-1.5 text-xs text-slate-600 font-bold hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmRejectDriver}
                    disabled={!rejectionReason.trim()}
                    className="px-3 py-1.5 text-xs text-white bg-red-600 hover:bg-red-700 font-bold rounded-lg disabled:opacity-50"
                  >
                    Confirm Rejection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PROVISIONING */}
      {activeTab === 'provisioning' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hospital Staff Provisioning Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Provision Hospital Staff Account</h2>
                <p className="text-xs text-slate-500">
                  Strict Tenancy Isolation: Account is tied to a specific hospital destination
                </p>
              </div>
            </div>

            {hospStaffMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  hospStaffMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {hospStaffMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{hospStaffMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleProvisionHospitalStaff} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Staff Member Name</label>
                <input
                  type="text"
                  value={hospStaffName}
                  onChange={(e) => setHospStaffName(e.target.value)}
                  placeholder="e.g. Dr. Priya Sharma"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={hospStaffEmail}
                    onChange={(e) => setHospStaffEmail(e.target.value)}
                    placeholder="staff.hospital@ems.local"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Temporary Password</label>
                  <input
                    type="password"
                    value={hospStaffPassword}
                    onChange={(e) => setHospStaffPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Hospital Facility</label>
                <select
                  value={hospStaffHospitalId}
                  onChange={(e) => setHospStaffHospitalId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  required
                >
                  {hospitalOverview.map((hosp) => (
                    <option key={hosp.id} value={hosp.id}>
                      {hosp.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Department / Role</label>
                <input
                  type="text"
                  value={hospStaffDepartment}
                  onChange={(e) => setHospStaffDepartment(e.target.value)}
                  placeholder="Emergency Department / Triage Head"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={hospStaffSubmitting}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50 mt-2"
              >
                {hospStaffSubmitting ? 'Provisioning Staff...' : 'Provision Hospital Staff'}
              </button>
            </form>
          </div>

          {/* Traffic Police Provisioning Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Provision Traffic Police Officer</h2>
                <p className="text-xs text-slate-500">
                  Jurisdiction Scoping: Officer receives clearance alerts only for their assigned zone
                </p>
              </div>
            </div>

            {policeMessage && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  policeMessage.type === 'success'
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}
              >
                {policeMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span>{policeMessage.text}</span>
              </div>
            )}

            <form onSubmit={handleProvisionPoliceOfficer} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Officer Name</label>
                <input
                  type="text"
                  value={policeOfficerName}
                  onChange={(e) => setPoliceOfficerName(e.target.value)}
                  placeholder="e.g. Officer Vinod Kadam"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Police Email</label>
                  <input
                    type="email"
                    value={policeOfficerEmail}
                    onChange={(e) => setPoliceOfficerEmail(e.target.value)}
                    placeholder="officer.kadam@aurangabad-ems.local"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Temporary Password</label>
                  <input
                    type="password"
                    value={policeOfficerPassword}
                    onChange={(e) => setPoliceOfficerPassword(e.target.value)}
                    placeholder="Min 8 chars"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Police Badge #</label>
                  <input
                    type="text"
                    value={policeBadgeNumber}
                    onChange={(e) => setPoliceBadgeNumber(e.target.value)}
                    placeholder="e.g. MH-TP-2091"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Assigned Jurisdiction Zone</label>
                  <select
                    value={policeJurisdictionZone}
                    onChange={(e) => setPoliceJurisdictionZone(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    required
                  >
                    <option value="ZONE_CENTRAL_KRANTI">Central Zone (Kranti Chowk, Seven Hills)</option>
                    <option value="ZONE_CIDCO">CIDCO Zone (Connaught, Jalna Road)</option>
                    <option value="ZONE_JALNA_ROAD">Jalna Road Corridor (MGM, Dhoot)</option>
                    <option value="ZONE_NORTH_BEED_BYPASS">Beed Bypass & Railway Station</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={policeSubmitting}
                className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors disabled:opacity-50 mt-2"
              >
                {policeSubmitting ? 'Provisioning Officer...' : 'Provision Traffic Police Officer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: SIGNALS & AUDIT LOGS */}
      {activeTab === 'signals_audit' && (
        <div className="space-y-6">
          {/* System Architecture & Health Diagnostic */}
          {systemHealth && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                  Security & Architecture Health
                </span>
                <h3 className="text-sm font-bold text-purple-950 mt-0.5">
                  Single Canonical Administrator Model Verified
                </h3>
                <p className="text-xs text-purple-800 mt-1">
                  Enforces exactly 1 administrator identity in SQLite. Protected multi-device sessions supported.
                </p>
              </div>
              <div className="flex gap-4 text-xs font-bold text-purple-900 shrink-0">
                <div>
                  <span className="text-[10px] text-purple-600 block">Users</span>
                  <span>{systemHealth.counts.totalUsers}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-600 block">Drivers</span>
                  <span>
                    {systemHealth.counts.approvedDrivers} / {systemHealth.counts.totalDrivers}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-600 block">Signals</span>
                  <span>{systemHealth.counts.totalSignals}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-600 block">Ambulances</span>
                  <span>{systemHealth.counts.totalAmbulances}</span>
                </div>
              </div>
            </div>
          )}

          {/* Traffic Signals Registry */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Radio className="w-5 h-5 text-amber-600" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">Configured Traffic Signal Registry</h2>
                  <p className="text-xs text-slate-500">
                    Real Aurangabad intersections mapped for ambulance corridor clearance. Software interface only (no physical light hardware claimed).
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-100">
                <thead>
                  <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5">Intersection / Signal</th>
                    <th className="py-2.5">Coordinates</th>
                    <th className="py-2.5">Responsible Unit</th>
                    <th className="py-2.5">Jurisdiction Zone</th>
                    <th className="py-2.5">Clearance Status</th>
                    <th className="py-2.5 text-right">Coordination Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {signals.map((sig) => (
                    <tr key={sig.id} className="hover:bg-slate-50">
                      <td className="py-3 font-bold text-slate-900">{sig.name}</td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">
                        {sig.latitude.toFixed(4)}, {sig.longitude.toFixed(4)}
                      </td>
                      <td className="py-3 text-slate-700">{sig.responsibleUnit}</td>
                      <td className="py-3 font-mono text-[10px] text-slate-600">{sig.jurisdictionZone}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                            sig.currentClearanceStatus === 'CLEARED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sig.currentClearanceStatus === 'REQUESTED'
                              ? 'bg-amber-100 text-amber-800'
                              : sig.currentClearanceStatus === 'BLOCKED'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {sig.currentClearanceStatus}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleToggleSignal(sig.id)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                            sig.isEnabled
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          {sig.isEnabled ? 'ENABLED' : 'DISABLED'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Audit Logs */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Security & Operational Audit Log</h2>
                <p className="text-xs text-slate-500">
                  Immutable record of driver approvals, role provisioning, and critical state transitions
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-100">
                <thead>
                  <tr className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5">Timestamp</th>
                    <th className="py-2.5">User</th>
                    <th className="py-2.5">Action</th>
                    <th className="py-2.5">Resource</th>
                    <th className="py-2.5">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.slice(0, 20).map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-2.5 font-mono text-[11px] text-slate-500">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 font-bold text-slate-800">{log.user?.name || log.userId}</td>
                      <td className="py-2.5">
                        <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-800">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-600 font-mono text-[11px]">{log.resourceType}</td>
                      <td className="py-2.5 text-slate-500 font-mono text-[11px] truncate max-w-xs">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DEMO CONTROLS & GPS SIMULATOR */}
      {activeTab === 'demo_controls' && (
        <div className="space-y-6">
          {/* Header Banner */}
          <div className="p-4 bg-gradient-to-r from-purple-950/60 to-neutral-900 border border-purple-800/60 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white flex items-center gap-2">
                  Deterministic Route-Following Demo GPS & Proximity Engine
                  <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800 font-bold px-2 py-0.5 rounded-full">
                    DEMO SIMULATOR
                  </span>
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Simulates realistic vehicle progression along OSRM road waypoints without teleportation. Coordinates traffic signals within the 5-minute lead window.
                </p>
              </div>
            </div>
            <button
              onClick={loadDemoData}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold rounded-xl border border-neutral-700 self-start sm:self-auto"
            >
              Refresh State
            </button>
          </div>

          {/* Simulator Config Card */}
          <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-purple-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Simulation Engine Parameters</h3>
                  <p className="text-xs text-neutral-400">Configure vehicle velocity and proximity alert thresholds</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">Engine Status:</span>
                {demoStatus?.enabled ? (
                  <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    ENABLED
                  </span>
                ) : (
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 border border-neutral-700 font-bold px-2 py-0.5 rounded-full">
                    STANDBY
                  </span>
                )}
              </div>
            </div>

            {configMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-medium border ${
                  configMessage.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                    : 'bg-red-950/40 border-red-800 text-red-200'
                }`}
              >
                {configMessage.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                  <span>Demo Speed</span>
                  <span className="text-purple-400 font-mono">{simSpeed} km/h</span>
                </label>
                <input
                  type="range"
                  min="20"
                  max="120"
                  step="5"
                  value={simSpeed}
                  onChange={(e) => setSimSpeed(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <span className="text-[10px] text-neutral-500 block">Waypoints traversal pace</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                  <span>Alert Lead Window</span>
                  <span className="text-amber-400 font-mono">{Math.round(simLeadTime / 60)} min ({simLeadTime}s)</span>
                </label>
                <input
                  type="range"
                  min="60"
                  max="600"
                  step="30"
                  value={simLeadTime}
                  onChange={(e) => setSimLeadTime(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <span className="text-[10px] text-neutral-500 block">Advance notice for traffic police</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                  <span>Route Proximity Radius</span>
                  <span className="text-blue-400 font-mono">{simRadius} km</span>
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="2.0"
                  step="0.1"
                  value={simRadius}
                  onChange={(e) => setSimRadius(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
                <span className="text-[10px] text-neutral-500 block">Max deviation of signal from route</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-300 flex items-center justify-between">
                  <span>Officer GPS Stale Window</span>
                  <span className="text-emerald-400 font-mono">{Math.round(simStale / 60)} min</span>
                </label>
                <input
                  type="range"
                  min="60"
                  max="900"
                  step="60"
                  value={simStale}
                  onChange={(e) => setSimStale(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <span className="text-[10px] text-neutral-500 block">Max age for qualified officer GPS</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveDemoConfig}
                disabled={isSavingConfig}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors shadow-lg shadow-purple-900/40"
              >
                {isSavingConfig ? 'Saving...' : 'Save Simulation Parameters'}
              </button>
            </div>
          </div>

          {/* Active Trips Simulator Table */}
          <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Navigation className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">Active Emergency Trips for Simulation</h3>
                  <p className="text-xs text-neutral-400">Control route-following demo GPS on active trips</p>
                </div>
              </div>
              <span className="text-xs font-mono text-neutral-400">
                {activeTripsForDemo.length} candidate trip(s)
              </span>
            </div>

            {activeTripsForDemo.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Navigation className="w-8 h-8 text-neutral-700 mx-auto" />
                <p className="text-xs text-neutral-400">No active trips currently in progress.</p>
                <p className="text-[11px] text-neutral-600">
                  Book an emergency dispatch from the Patient portal to test the route simulation.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-neutral-800">
                  <thead>
                    <tr className="text-neutral-500 uppercase font-bold text-[10px] tracking-wider">
                      <th className="py-2.5">Trip ID</th>
                      <th className="py-2.5">Status</th>
                      <th className="py-2.5">Driver / Unit</th>
                      <th className="py-2.5">Pickup Address</th>
                      <th className="py-2.5">Hospital</th>
                      <th className="py-2.5">Simulation State</th>
                      <th className="py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {activeTripsForDemo.map((t) => {
                      const isSimActive = t.isSimulationActive;
                      return (
                        <tr key={t.id} className="hover:bg-neutral-800/40">
                          <td className="py-3 font-mono text-[11px] text-neutral-400">
                            {t.id.slice(0, 8)}...
                          </td>
                          <td className="py-3">
                            <span className="font-bold text-[10px] px-2 py-0.5 rounded bg-neutral-800 text-neutral-200 border border-neutral-700">
                              {t.status}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="font-bold text-white">{t.driverName || 'Unassigned'}</div>
                            <div className="text-[10px] text-neutral-500 font-mono">
                              {t.ambulanceRegistration || 'No ambulance'}
                            </div>
                          </td>
                          <td className="py-3 text-neutral-300 max-w-xs truncate">
                            {t.pickupAddress}
                          </td>
                          <td className="py-3 text-neutral-400">
                            {t.hospitalName || 'Pending Pickup'}
                          </td>
                          <td className="py-3">
                            {isSimActive ? (
                              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                MOVING (DEMO)
                              </span>
                            ) : (
                              <span className="text-[10px] text-neutral-500">IDLE</span>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {isSimActive ? (
                              <button
                                onClick={() => handleStopSim(t.id)}
                                disabled={simActionLoading === t.id}
                                className="px-3 py-1 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 ml-auto"
                              >
                                <Square className="w-3 h-3" />
                                Stop Sim
                              </button>
                            ) : (
                              <button
                                onClick={() => handleStartSim(t.id)}
                                disabled={simActionLoading === t.id}
                                className="px-3 py-1 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border border-emerald-800 font-bold text-[11px] rounded-lg transition-colors flex items-center gap-1 ml-auto"
                              >
                                <Play className="w-3 h-3" />
                                Start Sim
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Proximity Qualification Diagnostic Card */}
          <div className="p-5 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-3">
            <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Proximity Alert Eligibility Matrix & Policy
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
                <span className="text-[10px] font-bold text-purple-400 block">Criterion 1: Active Trip</span>
                <p className="text-neutral-400 text-[11px]">
                  Ambulance must have an ACCEPTED or EN_ROUTE status. Booking confirmation alone produces zero alerts.
                </p>
              </div>
              <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
                <span className="text-[10px] font-bold text-blue-400 block">Criterion 2: On-Route Ahead</span>
                <p className="text-neutral-400 text-[11px]">
                  Signal must lie on or within {simRadius} km of the remaining OSRM road geometry. Signals behind vehicle are ignored.
                </p>
              </div>
              <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
                <span className="text-[10px] font-bold text-amber-400 block">Criterion 3: 5-Min Lead Time</span>
                <p className="text-neutral-400 text-[11px]">
                  Alert triggers when ETA to intersection is within {Math.round(simLeadTime / 60)} minutes, preventing early spam.
                </p>
              </div>
              <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 space-y-1">
                <span className="text-[10px] font-bold text-emerald-400 block">Criterion 4: Jurisdiction Filter</span>
                <p className="text-neutral-400 text-[11px]">
                  Alert is dispatched exclusively to officers assigned to the signal&apos;s zone with fresh GPS telemetry.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
