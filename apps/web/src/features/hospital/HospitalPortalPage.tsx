import React, { useState, useEffect } from 'react';
import { HospitalDTO, HospitalStatus, UserRole } from '@aurangabad-ambulance/shared';
import { api, ApiError } from '../../lib/api-client.js';
import { getSocket } from '../../lib/socket-client.js';
import { useAuth } from '../../hooks/use-auth.js';
import {
  Building2,
  BedDouble,
  Activity,
  Ambulance,
  Phone,
  Clock,
  Plus,
  Minus,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

export const HospitalPortalPage: React.FC = () => {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<HospitalDTO[]>([]);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [inboundTrips, setInboundTrips] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);

  // 1. Load hospitals
  const fetchHospitals = async () => {
    try {
      const list = await api.get<HospitalDTO[]>('/api/v1/hospitals');
      setHospitals(list);

      if (user?.hospitalId) {
        setSelectedHospitalId(user.hospitalId);
      } else if (list.length > 0 && !selectedHospitalId) {
        setSelectedHospitalId(list[0].id);
      }
    } catch (err) {
      console.warn('Error fetching hospitals:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, [user]);

  // 2. Fetch inbound trips for selected hospital
  const fetchInbound = async (id: string) => {
    if (!id) return;
    try {
      const trips = await api.get<any[]>(`/api/v1/hospitals/${id}/inbound`);
      setInboundTrips(trips);
    } catch (err) {
      console.warn('Error fetching inbound trips:', err);
    }
  };

  useEffect(() => {
    if (selectedHospitalId) {
      fetchInbound(selectedHospitalId);
    }
  }, [selectedHospitalId]);

  // 3. Socket real-time updates for capacity and trips
  useEffect(() => {
    const socket = getSocket();

    const handleCapacityChange = (updated: HospitalDTO) => {
      setHospitals((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    };

    const handleTripUpdate = () => {
      if (selectedHospitalId) {
        fetchInbound(selectedHospitalId);
      }
    };

    socket.on('hospital:capacity:changed', handleCapacityChange);
    socket.on('trip:updated', handleTripUpdate);

    return () => {
      socket.off('hospital:capacity:changed', handleCapacityChange);
      socket.off('trip:updated', handleTripUpdate);
    };
  }, [selectedHospitalId]);

  const activeHospital = hospitals.find((h) => h.id === selectedHospitalId);

  // Update Bed Counts
  const handleUpdateBeds = async (
    field: 'availableEmergencyBeds' | 'availableIcuBeds' | 'availableGeneralBeds',
    delta: number
  ) => {
    if (!activeHospital) return;
    const currentVal = activeHospital[field];
    const nextVal = Math.max(0, currentVal + delta);
    if (nextVal === currentVal) return;

    setIsUpdating(true);
    setMessage(null);

    try {
      const updated = await api.patch<HospitalDTO>(`/api/v1/hospitals/${activeHospital.id}/capacity`, {
        availableEmergencyBeds:
          field === 'availableEmergencyBeds' ? nextVal : activeHospital.availableEmergencyBeds,
        availableIcuBeds: field === 'availableIcuBeds' ? nextVal : activeHospital.availableIcuBeds,
        availableGeneralBeds:
          field === 'availableGeneralBeds' ? nextVal : activeHospital.availableGeneralBeds,
        status: activeHospital.status,
      });

      setHospitals((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
      setMessage('Bed capacity updated and synchronized across EMS dispatch.');
    } catch (err: any) {
      alert(err.message || 'Failed to update capacity.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Update Status
  const handleUpdateStatus = async (status: HospitalStatus) => {
    if (!activeHospital) return;
    setIsUpdating(true);
    try {
      const updated = await api.patch<HospitalDTO>(`/api/v1/hospitals/${activeHospital.id}/capacity`, {
        availableEmergencyBeds: activeHospital.availableEmergencyBeds,
        availableIcuBeds: activeHospital.availableIcuBeds,
        availableGeneralBeds: activeHospital.availableGeneralBeds,
        status,
      });
      setHospitals((prev) => prev.map((h) => (h.id === updated.id ? updated : h)));
    } catch (err: any) {
      alert(err.message || 'Failed to update hospital status.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-88px)] bg-neutral-950 text-neutral-100 font-sans py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-800">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-lg shadow-emerald-900/40">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white tracking-tight leading-none">
                  Hospital ER Command Portal
                </h1>
                <p className="text-xs text-neutral-400 mt-1">
                  Chhatrapati Sambhajinagar Emergency Receiving Facility Operations
                </p>
              </div>
            </div>
          </div>

          {/* Facility Selector */}
          <div className="flex items-center gap-2.5">
            <label className="text-xs font-bold text-neutral-400">Receiving Facility:</label>
            <select
              value={selectedHospitalId}
              onChange={(e) => setSelectedHospitalId(e.target.value)}
              disabled={user?.role === UserRole.HOSPITAL_STAFF && !!user?.hospitalId}
              className="text-xs font-bold bg-neutral-900 border border-neutral-700 rounded-xl px-3.5 py-2 text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} {user?.hospitalId === h.id ? '(Assigned)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message && (
          <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {activeHospital && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* BED CAPACITY CONTROLS (LEFT 2 COLS) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Facility Status Card */}
              <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
                  <div>
                    <h2 className="text-lg font-black text-white">{activeHospital.name}</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">{activeHospital.address}</p>
                    <p className="text-xs text-neutral-400 mt-0.5 font-mono">ER Desk: {activeHospital.phone}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-400">ER Operational State:</span>
                    <select
                      value={activeHospital.status}
                      onChange={(e) => handleUpdateStatus(e.target.value as HospitalStatus)}
                      className={`text-xs font-black px-3 py-1.5 rounded-xl border ${
                        activeHospital.status === HospitalStatus.OPERATIONAL
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                          : activeHospital.status === HospitalStatus.DIVERTING
                          ? 'bg-red-950 text-red-300 border-red-700'
                          : 'bg-amber-950 text-amber-300 border-amber-700'
                      }`}
                    >
                      <option value={HospitalStatus.OPERATIONAL}>OPERATIONAL</option>
                      <option value={HospitalStatus.HIGH_CAPACITY}>HIGH CAPACITY</option>
                      <option value={HospitalStatus.DIVERTING}>DIVERTING</option>
                      <option value={HospitalStatus.CLOSED}>CLOSED</option>
                    </select>
                  </div>
                </div>

                {/* Bed Counters */}
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Emergency Beds */}
                  <div className="p-4 bg-red-950/30 border border-red-800/60 rounded-2xl">
                    <div className="flex items-center justify-between text-xs text-red-400 font-extrabold uppercase tracking-wider">
                      <span>Emergency Beds</span>
                      <Activity className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="text-3xl font-black text-white my-2">
                      {activeHospital.availableEmergencyBeds}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleUpdateBeds('availableEmergencyBeds', -1)}
                        className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg border border-neutral-700 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdateBeds('availableEmergencyBeds', 1)}
                        className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg shadow-md transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* ICU Beds */}
                  <div className="p-4 bg-blue-950/30 border border-blue-800/60 rounded-2xl">
                    <div className="flex items-center justify-between text-xs text-blue-400 font-extrabold uppercase tracking-wider">
                      <span>ICU / Ventilators</span>
                      <BedDouble className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-3xl font-black text-white my-2">
                      {activeHospital.availableIcuBeds}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleUpdateBeds('availableIcuBeds', -1)}
                        className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg border border-neutral-700 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdateBeds('availableIcuBeds', 1)}
                        className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-md transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* General Beds */}
                  <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl">
                    <div className="flex items-center justify-between text-xs text-neutral-400 font-extrabold uppercase tracking-wider">
                      <span>General Beds</span>
                      <BedDouble className="w-4 h-4 text-neutral-400" />
                    </div>
                    <div className="text-3xl font-black text-white my-2">
                      {activeHospital.availableGeneralBeds}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleUpdateBeds('availableGeneralBeds', -1)}
                        className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg border border-neutral-700 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleUpdateBeds('availableGeneralBeds', 1)}
                        className="p-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Facilities Badges */}
                <div className="mt-5 pt-4 border-t border-neutral-800 flex flex-wrap gap-2 text-xs">
                  <span className="font-bold text-neutral-400 mr-1">Verified Capabilities:</span>
                  {activeHospital.hasTraumaCenter && (
                    <span className="bg-red-950 text-red-300 border border-red-800/80 font-bold px-2.5 py-0.5 rounded-full">
                      Level 1 Trauma Center
                    </span>
                  )}
                  {activeHospital.hasCathLab && (
                    <span className="bg-blue-950 text-blue-300 border border-blue-800/80 font-bold px-2.5 py-0.5 rounded-full">
                      24x7 Cardiac Cath Lab
                    </span>
                  )}
                  {activeHospital.hasStrokeUnit && (
                    <span className="bg-purple-950 text-purple-300 border border-purple-800/80 font-bold px-2.5 py-0.5 rounded-full">
                      Certified Stroke Unit
                    </span>
                  )}
                </div>
              </div>

              {/* LIVE INBOUND AMBULANCE QUEUE */}
              <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Ambulance className="w-5 h-5 text-red-500" />
                    <h3 className="text-base font-black text-white">
                      Live Inbound Emergency Queue ({inboundTrips.length})
                    </h3>
                  </div>
                  <button
                    onClick={() => fetchInbound(selectedHospitalId)}
                    className="p-1.5 text-neutral-400 hover:text-white rounded-lg transition-colors"
                    title="Refresh Queue"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {inboundTrips.length === 0 ? (
                  <div className="py-12 text-center text-neutral-500">
                    <Clock className="w-10 h-10 mx-auto text-neutral-600 mb-2 stroke-1" />
                    <p className="text-sm font-bold text-neutral-300">No ambulances currently inbound</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      Incoming emergency units will appear here automatically via Socket.IO
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 divide-y divide-neutral-800">
                    {inboundTrips.map((trip) => (
                      <div key={trip.id} className="py-3.5 flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">
                              {trip.emergencyCategory.replace(/_/g, ' ')}
                            </span>
                            <span className="text-[10px] font-black px-2 py-0.5 bg-red-600 text-white rounded">
                              {trip.priority}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-300 mt-1">
                            Patient: {trip.patientName} &bull; Contact: {trip.patientPhone || 'Confidential'}
                          </div>
                          <div className="text-xs text-neutral-400 mt-0.5">
                            Ambulance: {trip.ambulanceRegistration} &bull; Driver: {trip.driverName}
                          </div>
                          {trip.notes && (
                            <div className="text-xs text-amber-200 bg-amber-950/40 p-2 rounded-lg mt-1.5 border border-amber-800/60">
                              Clinical Symptoms: {trip.notes}
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black px-2.5 py-1 bg-neutral-800 text-white rounded-full border border-neutral-700">
                            {trip.status.replace(/_/g, ' ')}
                          </span>
                          {trip.predictedDelaySeconds && (
                            <span className="text-[11px] text-neutral-400 block mt-1.5">
                              Est. Delay: ~{Math.round(trip.predictedDelaySeconds / 60)} min
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COL: ALL FACILITIES OVERVIEW */}
            <div className="space-y-4">
              <div className="bg-neutral-900 p-5 rounded-2xl border border-neutral-800 shadow-xl">
                <h3 className="text-sm font-black text-white pb-3 border-b border-neutral-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span>Aurangabad Hospital Network Status</span>
                </h3>

                <div className="mt-3 divide-y divide-neutral-800">
                  {hospitals.map((h) => (
                    <div key={h.id} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between font-bold text-white">
                        <span className="truncate pr-2">{h.name.replace(/ \(.*\)/, '')}</span>
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded ${
                            h.status === HospitalStatus.OPERATIONAL
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : 'bg-amber-950 text-amber-300 border border-amber-800'
                          }`}
                        >
                          {h.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-neutral-400 text-[11px]">
                        <span>ER: <strong className="text-red-400">{h.availableEmergencyBeds}</strong></span>
                        <span>ICU: <strong className="text-blue-400">{h.availableIcuBeds}</strong></span>
                        <span>Gen: <strong className="text-neutral-200">{h.availableGeneralBeds}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
