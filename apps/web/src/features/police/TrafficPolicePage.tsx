import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrafficCorridorEventDTO, TrafficBlockageDTO, TrafficSignalDTO, TrafficSeverity,
} from '@aurangabad-ambulance/shared';
import { api } from '../../lib/api-client.js';
import { getSocket } from '../../lib/socket-client.js';
import { useAuth } from '../../hooks/use-auth.js';
import { EmergencyMap } from '../../components/maps/EmergencyMap.js';
import { ErrorBoundary } from '../../components/common/ErrorBoundary.js';
import {
  ShieldAlert, AlertOctagon, CheckCircle, Plus, Radio, RefreshCw,
  EyeOff, Info, X, Compass, Wifi, WifiOff, AlertTriangle, MapPin,
  Activity, Bell, History, Navigation, ArrowRight, XCircle,
  LocateFixed,
} from 'lucide-react';

interface ProximityAlert {
  type: 'PROXIMITY_ALERT';
  tripId: string; corridorId?: string; signalId: string; signalCode: string;
  signalName: string; signalRoadName: string; signalLatitude: number; signalLongitude: number;
  jurisdictionZone: string; ambulanceRegistration: string | null;
  ambulanceLatitude: number; ambulanceLongitude: number;
  emergencyPriority: string; emergencyCategory: string; hospitalName: string | null;
  etaSeconds: number; etaMinutes: number; isSimulated: boolean; timestamp: string;
  status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'CLEARED';
}

function formatEta(seconds: number): string {
  if (seconds < 60) return Math.round(seconds) + 's';
  const m = Math.floor(seconds / 60), s = Math.round(seconds % 60);
  return s > 0 ? m + 'm ' + s + 's' : m + 'm';
}

function useCountdown(etaSeconds: number, timestamp: string): number {
  const [remaining, setRemaining] = useState<number>(etaSeconds);
  useEffect(() => {
    const t0 = new Date(timestamp).getTime();
    const tick = () => setRemaining(Math.max(0, etaSeconds - (Date.now() - t0) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [etaSeconds, timestamp]);
  return remaining;
}

function CountdownBadge({ etaSeconds, timestamp }: { etaSeconds: number; timestamp: string }) {
  const rem = useCountdown(etaSeconds, timestamp);
  const pct = Math.min(100, (rem / etaSeconds) * 100);
  const urgent = rem < 60;
  const color = urgent ? 'text-red-400' : rem < 180 ? 'text-amber-400' : 'text-emerald-400';
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`font-black text-base leading-none ${color}`}>{formatEta(rem)}</span>
      <div className="w-16 h-1 bg-neutral-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-1000 ${urgent ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: pct + '%' }} />
      </div>
      <span className="text-[9px] text-neutral-500">ETA remaining</span>
    </div>
  );
}

export const TrafficPolicePage: React.FC = () => {
  const { user } = useAuth();
  const [corridors, setCorridors] = useState<TrafficCorridorEventDTO[]>([]);
  const [blockages, setBlockages] = useState<TrafficBlockageDTO[]>([]);
  const [signals, setSignals] = useState<TrafficSignalDTO[]>([]);
  const [ambulances, setAmbulances] = useState<any[]>([]);
  const [proximityAlerts, setProximityAlerts] = useState<ProximityAlert[]>([]);
  const [alertHistory, setAlertHistory] = useState<ProximityAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'alerts' | 'corridors' | 'blockages' | 'history'>('alerts');
  const [mobileView, setMobileView] = useState<'panel' | 'map'>('panel');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [blockageTitle, setBlockageTitle] = useState('');
  const [roadName, setRoadName] = useState('Jalna Road');
  const [blockageLat, setBlockageLat] = useState<number>(19.877);
  const [blockageLng, setBlockageLng] = useState<number>(75.341);
  const [severity, setSeverity] = useState<TrafficSeverity>(TrafficSeverity.HIGH);
  const [description, setDescription] = useState('');
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Dedicated Officer Location & GPS Workflow
  const [isLocationSharing, setIsLocationSharing] = useState<boolean>(true);
  const [gpsMode, setGpsMode] = useState<'REAL' | 'DEMO'>('DEMO');
  const [officerLat, setOfficerLat] = useState<number>(19.8762);
  const [officerLng, setOfficerLng] = useState<number>(75.3242);
  const [officerAccuracy, setOfficerAccuracy] = useState<number | null>(8);
  const [gpsPermission, setGpsPermission] = useState<'PROMPT' | 'GRANTED' | 'DENIED' | 'UNAVAILABLE'>('PROMPT');
  const [demoStation, setDemoStation] = useState<string>('Kranti Chowk Post');

  const DEMO_STATIONS = [
    { name: 'Kranti Chowk Post', lat: 19.8762, lng: 75.3242, zone: 'CITY_CENTRAL' },
    { name: 'Seven Hills Junction', lat: 19.8748, lng: 75.3524, zone: 'CIDCO' },
    { name: 'CIDCO Cannaught', lat: 19.8732, lng: 75.3582, zone: 'CIDCO' },
    { name: 'Railway Station Post', lat: 19.8654, lng: 75.3123, zone: 'CITY_CENTRAL' },
    { name: 'Waluj Octroi Post', lat: 19.8450, lng: 75.2400, zone: 'WALUJ' },
  ];

  useEffect(() => {
    if (!isLocationSharing || gpsMode !== 'REAL') return;
    if (!navigator.geolocation) {
      setGpsPermission('UNAVAILABLE');
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setOfficerLat(pos.coords.latitude);
        setOfficerLng(pos.coords.longitude);
        setOfficerAccuracy(Math.round(pos.coords.accuracy));
        setGpsPermission('GRANTED');
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGpsPermission('DENIED');
        else setGpsPermission('UNAVAILABLE');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isLocationSharing, gpsMode]);

  const handleSelectDemoStation = (stName: string) => {
    const found = DEMO_STATIONS.find(s => s.name === stName);
    if (found) {
      setDemoStation(found.name);
      setOfficerLat(found.lat);
      setOfficerLng(found.lng);
      setOfficerAccuracy(5);
    }
  };

  const playAlert = useCallback(() => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ctx = audioCtxRef.current, osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } catch {}
  }, []);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true); setFetchError(null);
    try {
      const [cr, br, sr, fr] = await Promise.allSettled([
        api.get<TrafficCorridorEventDTO[]>('/api/v1/traffic/corridors'),
        api.get<TrafficBlockageDTO[]>('/api/v1/traffic/blockages'),
        api.get<TrafficSignalDTO[]>('/api/v1/traffic/signals'),
        api.get<any[]>('/api/v1/tracking/fleet'),
      ]);
      if (cr.status === 'fulfilled' && Array.isArray(cr.value)) setCorridors(cr.value);
      if (br.status === 'fulfilled' && Array.isArray(br.value)) setBlockages(br.value);
      if (sr.status === 'fulfilled' && Array.isArray(sr.value)) setSignals(sr.value);
      if (fr.status === 'fulfilled' && Array.isArray(fr.value)) setAmbulances(fr.value);
      if (cr.status === 'rejected' && br.status === 'rejected' && sr.status === 'rejected')
        setFetchError('Unable to sync traffic coordination services.');
    } catch (err: any) { setFetchError(err?.message || 'Error updating data.'); }
    finally { setIsLoading(false); setIsRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const socket = getSocket();
    setIsConnected(socket.connected);
    const onConn = () => setIsConnected(true);
    const onDisconn = () => setIsConnected(false);
    socket.on('connect', onConn); socket.on('disconnect', onDisconn); socket.on('connect_error', onDisconn);
    socket.on('traffic:corridor:updated', () => fetchData());
    socket.on('traffic:blockage:reported', (b: TrafficBlockageDTO) => setBlockages(p => [b, ...p.filter(x => x.id !== b.id)]));
    socket.on('driver:location:changed', (loc: any) => setAmbulances(p => p.map(a => a.id === loc.ambulanceId ? { ...a, latitude: loc.latitude, longitude: loc.longitude, currentLatitude: loc.latitude, currentLongitude: loc.longitude, isSimulated: loc.isSimulated } : a)));
    socket.on('traffic:signal:proximity_alert', (alert: ProximityAlert) => {
      const myZone = (user as any)?.jurisdictionZone;
      if (myZone && myZone !== 'ALL' && alert.jurisdictionZone !== myZone) return;
      setProximityAlerts(prev => {
        const exists = prev.find(a => a.tripId === alert.tripId && a.signalId === alert.signalId);
        if (exists) return prev.map(a => (a.tripId === alert.tripId && a.signalId === alert.signalId) ? { ...alert, status: a.status } : a);
        playAlert();
        return [{ ...alert, status: 'ACTIVE' as const }, ...prev];
      });
      setActiveTab('alerts');
    });
    return () => {
      socket.off('connect', onConn); socket.off('disconnect', onDisconn); socket.off('connect_error', onDisconn);
      socket.off('traffic:corridor:updated'); socket.off('traffic:blockage:reported');
      socket.off('driver:location:changed'); socket.off('traffic:signal:proximity_alert');
    };
  }, [fetchData, playAlert, user]);

  const ackAlert = (a: ProximityAlert) => setProximityAlerts(p => p.map(x => (x.tripId === a.tripId && x.signalId === a.signalId) ? { ...x, status: 'ACKNOWLEDGED' } : x));
  const clearAlertFn = (a: ProximityAlert) => { setProximityAlerts(p => p.filter(x => !(x.tripId === a.tripId && x.signalId === a.signalId))); setAlertHistory(p => [{ ...a, status: 'CLEARED' }, ...p.slice(0, 49)]); };
  const corridorAction = async (tripId: string, action: 'ACKNOWLEDGE' | 'CLEAR') => { try { await api.post('/api/v1/traffic/corridors/action', { tripId, action }); fetchData(); } catch (err: any) { alert(err.message); } };
  const createBlockage = async (e: React.FormEvent) => { e.preventDefault(); try { const c = await api.post<TrafficBlockageDTO>('/api/v1/traffic/blockages', { title: blockageTitle, roadName, latitude: blockageLat, longitude: blockageLng, severity, description: description.trim() || undefined, estimatedDurationMinutes: 120 }); setBlockages(p => [c, ...p]); setShowModal(false); setBlockageTitle(''); setDescription(''); } catch (err: any) { alert(err.message); } };
  const resolveBlockage = async (id: string) => { try { await api.patch('/api/v1/traffic/blockages/' + id + '/resolve'); setBlockages(p => p.filter(b => b.id !== id)); } catch (err: any) { alert(err.message); } };

  const activeAlerts = proximityAlerts.filter(a => a.status !== 'CLEARED');
  const unackCount = activeAlerts.filter(a => a.status === 'ACTIVE').length;

  const priBg = (p: string) => p === 'CRITICAL' ? 'bg-red-600 text-white' : p === 'URGENT' ? 'bg-amber-600 text-white' : 'bg-blue-700 text-white';

  return (
    <div className="relative h-[calc(100vh-88px)] w-full flex flex-col md:flex-row overflow-hidden bg-neutral-950 font-sans text-neutral-100">
      <div className="md:hidden z-30 flex border-b border-neutral-800 bg-neutral-900 text-xs font-bold">
        {[{ id: 'panel', label: 'Traffic Console', Icon: ShieldAlert, c: 'text-amber-500' }, { id: 'map', label: 'City Map', Icon: Compass, c: 'text-emerald-400' }].map(t => (
          <button key={t.id} onClick={() => setMobileView(t.id as any)} className={'flex-1 py-3 flex items-center justify-center gap-1.5 transition-colors ' + (mobileView === t.id ? 'text-white border-b-2 border-amber-500 bg-neutral-800' : 'text-neutral-400')}>
            <t.Icon className={'w-4 h-4 ' + t.c} /><span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className={'z-20 w-full md:w-[480px] lg:w-[520px] h-full bg-neutral-900 border-r border-neutral-800 shadow-2xl flex flex-col overflow-hidden ' + (mobileView === 'map' ? 'hidden md:flex' : 'flex')}>
        <div className="px-5 pt-5 pb-3 border-b border-neutral-800 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-neutral-950 flex items-center justify-center font-black shadow-lg shadow-amber-900/40 shrink-0"><ShieldAlert className="w-6 h-6" /></div>
              <div>
                <h1 className="text-base font-black text-white leading-tight">Traffic Police Console</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-neutral-300 font-semibold">{user?.name || 'Officer Terminal'}</span>
                  <span className="text-[10px] bg-neutral-800 text-neutral-300 font-bold px-1.5 py-0.5 rounded border border-neutral-700">{user?.role === 'ADMIN' ? 'SUPERVISOR' : 'OFFICER'}</span>
                </div>
              </div>
            </div>
            <button onClick={fetchData} disabled={isRefreshing} className="p-2 text-neutral-400 hover:text-white rounded-lg border border-neutral-800 hover:bg-neutral-800 disabled:opacity-50">
              <RefreshCw className={'w-4 h-4 ' + (isRefreshing ? 'animate-spin text-amber-400' : '')} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-[11px]">
              <div className="text-neutral-500 mb-0.5">Assigned Zone</div>
              {(user as any)?.jurisdictionZone ? <span className="font-extrabold text-amber-400">{(user as any).jurisdictionZone}</span>
                : user?.role === 'ADMIN' ? <span className="font-extrabold text-emerald-400 text-[10px]">ALL ZONES</span>
                : <span className="font-bold text-amber-500">Not Configured</span>}
            </div>
            <div className="px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-[11px]">
              <div className="text-neutral-500 mb-0.5">Live Telemetry</div>
              {isConnected ? <span className="font-bold text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /><Wifi className="w-3 h-3" />Connected</span>
                : <span className="font-bold text-amber-400 flex items-center gap-1"><WifiOff className="w-3 h-3" />Reconnecting</span>}
            </div>
          </div>

          {/* Officer GPS & Location Workflow Card */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-300">
                <LocateFixed className="w-3.5 h-3.5 text-amber-400" />
                <span>Officer Location & GPS</span>
              </div>
              <button
                onClick={() => setIsLocationSharing(!isLocationSharing)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                  isLocationSharing
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                }`}
              >
                {isLocationSharing ? 'Sharing: ACTIVE' : 'Sharing: OFF'}
              </button>
            </div>

            {isLocationSharing ? (
              <div className="space-y-2 pt-1 border-t border-neutral-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="text-neutral-500 text-[10px]">Mode:</span>
                    <button
                      onClick={() => setGpsMode(gpsMode === 'REAL' ? 'DEMO' : 'REAL')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-colors ${
                        gpsMode === 'REAL'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {gpsMode === 'REAL' ? 'REAL GPS' : 'DEMO GPS'}
                    </button>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {officerLat.toFixed(4)}, {officerLng.toFixed(4)}
                  </span>
                </div>

                {gpsMode === 'DEMO' ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] text-neutral-400 shrink-0">Patrol Post:</span>
                    <select
                      value={demoStation}
                      onChange={(e) => handleSelectDemoStation(e.target.value)}
                      className="bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-[10px] text-white flex-1 focus:outline-none"
                    >
                      {DEMO_STATIONS.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.zone})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="text-[10px] text-neutral-400 flex items-center justify-between">
                    <span>
                      Permission: <strong className={gpsPermission === 'GRANTED' ? 'text-emerald-400' : 'text-amber-400'}>{gpsPermission}</strong>
                    </span>
                    <span>Accuracy: ~{officerAccuracy || 10}m</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-2 bg-amber-950/30 border border-amber-800/50 rounded-lg text-[10px] text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Location sharing disabled. Alerts restricted to assigned zone.</span>
              </div>
            )}
          </div>

          {fetchError && <div className="px-3 py-2 bg-amber-950/40 border border-amber-800 text-xs text-amber-200 rounded-xl flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />{fetchError}</span><button onClick={fetchData} className="px-2 py-1 bg-amber-900 text-white font-bold rounded text-[10px]">Retry</button></div>}
          <div className="px-3 py-2 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-[10px] text-emerald-200 flex items-center gap-2"><EyeOff className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span><strong>Zero-PII Mode:</strong> Patient identity strictly excluded.</span></div>
        </div>

        <div className="flex border-b border-neutral-800 shrink-0 text-[11px] font-bold">
          {[{ id: 'alerts', l: 'Alerts', I: Bell, n: unackCount, nb: unackCount > 0 ? 'bg-red-600' : 'bg-neutral-700' },
            { id: 'corridors', l: 'Corridors', I: Radio, n: corridors.length, nb: 'bg-neutral-700' },
            { id: 'blockages', l: 'Blockages', I: AlertOctagon, n: blockages.length, nb: 'bg-neutral-700' },
            { id: 'history', l: 'History', I: History, n: alertHistory.length, nb: 'bg-neutral-700' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)} className={'flex-1 py-2.5 flex items-center justify-center gap-1 transition-colors ' + (activeTab === t.id ? 'text-white border-b-2 border-amber-500 bg-neutral-800/50' : 'text-neutral-500 hover:text-neutral-300')}>
              <t.I className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.l}</span>
              {t.n > 0 && <span className={t.nb + ' text-white text-[9px] font-black px-1.5 py-0.5 rounded-full'}>{t.n}</span>}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'alerts' && (activeAlerts.length === 0
            ? <div className="p-8 text-center space-y-2">{isLoading ? <Activity className="w-8 h-8 text-amber-400 animate-spin mx-auto" /> : <Bell className="w-8 h-8 text-neutral-700 mx-auto" />}<p className="text-xs text-neutral-500">{isLoading ? 'Awaiting alerts...' : 'No active signal alerts'}</p>{!isLoading && <p className="text-[10px] text-neutral-600">Alerts appear when an ambulance approaches a signal in your jurisdiction within 5 min ETA.</p>}</div>
            : <div className="space-y-3">{activeAlerts.map(a => (
              <div key={a.tripId + a.signalId} className={'p-4 rounded-2xl border shadow-md ' + (a.status === 'ACKNOWLEDGED' ? 'bg-neutral-900 border-neutral-700' : 'bg-red-950/30 border-red-800/60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={'text-[10px] font-black px-2 py-0.5 rounded ' + priBg(a.emergencyPriority)}>{a.emergencyPriority}</span>
                      {a.isSimulated && <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-800 font-bold px-1.5 py-0.5 rounded">DEMO GPS</span>}
                      {a.status === 'ACKNOWLEDGED' && <span className="text-[9px] bg-blue-950 text-blue-300 border border-blue-800 font-bold px-1.5 py-0.5 rounded">ACK</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-black text-white"><MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" /><span className="truncate">{a.signalName}</span></div>
                    <div className="text-[11px] text-neutral-400">{a.signalRoadName}</div>
                    <div className="flex items-center gap-3 text-[11px] text-neutral-300 mt-1">
                      <span className="flex items-center gap-1"><Navigation className="w-3 h-3 text-blue-400" />{a.ambulanceRegistration || 'Emergency Unit'}</span>
                      {a.hospitalName && <span className="flex items-center gap-1 text-neutral-500 truncate"><ArrowRight className="w-3 h-3" />{a.hospitalName}</span>}
                    </div>
                    <div className="text-[10px] text-neutral-600">Zone: <span className="text-amber-400 font-bold">{a.jurisdictionZone}</span> &bull; {new Date(a.timestamp).toLocaleTimeString()}</div>
                  </div>
                  <CountdownBadge etaSeconds={a.etaSeconds} timestamp={a.timestamp} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => ackAlert(a)} disabled={a.status === 'ACKNOWLEDGED'} className="py-2 px-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 text-white font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" />{a.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Acknowledge'}</button>
                  <button onClick={() => clearAlertFn(a)} className="py-2 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 border border-neutral-700"><XCircle className="w-3.5 h-3.5 text-emerald-400" />Vehicle Passed</button>
                </div>
              </div>
            ))}</div>
          )}
          {activeTab === 'corridors' && (corridors.length === 0
            ? <div className="p-8 text-center"><Radio className="w-8 h-8 text-neutral-700 mx-auto mb-2" /><p className="text-xs text-neutral-500">No active emergency corridors in your jurisdiction.</p></div>
            : <div className="space-y-3">{corridors.map(c => (
              <div key={c.tripId} className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-md">
                <div className="flex items-center justify-between"><span className="text-[10px] font-black px-2 py-0.5 bg-red-600 text-white rounded">{c.emergencyPriority}</span><span className="text-[10px] font-bold text-neutral-300 px-2 py-0.5 bg-neutral-800 border border-neutral-700 rounded">{c.corridorStatus}</span></div>
                <div className="mt-2 text-xs text-white font-bold flex items-center justify-between"><span>{c.ambulanceRegistration || 'Emergency Unit'}</span>{c.isSimulated && <span className="text-[9px] bg-amber-950 text-amber-300 border border-amber-800 font-bold px-1.5 py-0.5 rounded">DEMO GPS</span>}</div>
                <div className="text-[11px] text-neutral-400 mt-0.5">To: {c.hospitalName || 'En Route'} &bull; Zone: {c.jurisdictionZone || 'CITY'}</div>
                {c.upcomingSignal
                  ? <div className="mt-2.5 p-2.5 bg-amber-950/40 border border-amber-800/80 rounded-xl text-[11px]"><div className="flex items-center justify-between font-bold text-amber-200"><span>🚦 {c.upcomingSignal.name}</span><span className="text-[10px] bg-amber-900 px-1.5 py-0.5 rounded">{c.estimatedArrivalSeconds ? formatEta(c.estimatedArrivalSeconds) : 'Approaching'}</span></div><div className="text-[10px] text-amber-300/80 mt-0.5 flex justify-between"><span>{c.upcomingSignal.roadName}</span><span>{c.upcomingSignal.clearanceStatus}</span></div></div>
                  : <div className="mt-2 p-2 bg-neutral-900 border border-neutral-800 rounded-xl text-[10px] text-neutral-500 italic">Scanning next junction...</div>}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => corridorAction(c.tripId, 'ACKNOWLEDGE')} className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" />Clear Signal</button>
                  <button onClick={() => corridorAction(c.tripId, 'CLEAR')} className="py-2 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-[11px] rounded-xl flex items-center justify-center gap-1.5 border border-neutral-700">Vehicle Passed</button>
                </div>
              </div>
            ))}</div>
          )}
          {activeTab === 'blockages' && (
            <>
              <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-black uppercase tracking-wider text-neutral-400">Obstructions ({blockages.length})</span><button onClick={() => setShowModal(true)} className="text-[11px] font-bold text-amber-300 flex items-center gap-1 px-2.5 py-1 bg-amber-950/80 rounded-lg border border-amber-800"><Plus className="w-3.5 h-3.5" />Report</button></div>
              {blockages.length === 0 ? <div className="p-8 text-center"><AlertOctagon className="w-8 h-8 text-neutral-700 mx-auto mb-2" /><p className="text-xs text-neutral-500">No active road obstructions.</p></div>
                : <div className="space-y-2">{blockages.map(b => (<div key={b.id} className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-xs flex items-center justify-between"><div><div className="font-bold text-white">{b.title}</div><div className="text-neutral-400 text-[10px]">{b.roadName} &bull; <span className="font-bold text-amber-400">{b.severity}</span></div></div><button onClick={() => resolveBlockage(b.id)} className="text-[11px] font-bold text-emerald-400 bg-emerald-950 px-2 py-1 rounded-lg border border-emerald-800">Resolve</button></div>))}</div>}
            </>
          )}
          {activeTab === 'history' && (alertHistory.length === 0
            ? <div className="p-8 text-center"><History className="w-8 h-8 text-neutral-700 mx-auto mb-2" /><p className="text-xs text-neutral-500">No alert history this session.</p></div>
            : <div className="space-y-2">{alertHistory.map((a, i) => (<div key={i} className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-[11px]"><div className="flex items-center justify-between mb-0.5"><span className="font-bold text-neutral-300">{a.signalName}</span><span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-bold">CLEARED</span></div><div className="text-[10px] text-neutral-500">{a.ambulanceRegistration || 'Emergency Unit'} &bull; {new Date(a.timestamp).toLocaleTimeString()}{a.isSimulated ? ' (DEMO)' : ''}</div></div>))}</div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-neutral-800 text-[10px] text-neutral-600 text-center shrink-0 flex items-center justify-center gap-1"><Info className="w-3 h-3" />Aurangabad Smart Mobility &bull; Police Terminal &bull; No physical override</div>
      </div>

      <div className={'flex-1 h-full w-full relative min-h-[400px] ' + (mobileView === 'panel' ? 'hidden md:block' : 'block')}>
        <ErrorBoundary title="Traffic Map Temporarily Unavailable" message="Signal controls remain active." onReset={fetchData}>
          <EmergencyMap
            ambulances={ambulances}
            blockages={blockages}
            trafficSignals={signals}
            pickupLat={isLocationSharing ? officerLat : undefined}
            pickupLng={isLocationSharing ? officerLng : undefined}
            pickupLabel={isLocationSharing ? (gpsMode === 'REAL' ? 'Officer Position (Real GPS)' : `Patrol Post: ${demoStation}`) : undefined}
            showBoundary={true}
            className="h-full w-full min-h-[400px]"
          />
        </ErrorBoundary>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 text-neutral-100 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-neutral-800">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800 mb-4">
              <h3 className="text-base font-black text-white flex items-center gap-2"><AlertOctagon className="w-5 h-5 text-amber-400" />Report Road Obstruction</h3>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-white p-1"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={createBlockage} className="space-y-4 text-xs">
              <div><label className="font-bold text-neutral-300 block mb-1">Title</label><input type="text" value={blockageTitle} onChange={e => setBlockageTitle(e.target.value)} className="w-full p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500" required /></div>
              <div><label className="font-bold text-neutral-300 block mb-1">Road Name</label><input type="text" value={roadName} onChange={e => setRoadName(e.target.value)} className="w-full p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500" required /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="font-bold text-neutral-300 block mb-1">Lat</label><input type="number" step="any" value={blockageLat} onChange={e => setBlockageLat(parseFloat(e.target.value))} className="w-full p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500" required /></div>
                <div><label className="font-bold text-neutral-300 block mb-1">Lng</label><input type="number" step="any" value={blockageLng} onChange={e => setBlockageLng(parseFloat(e.target.value))} className="w-full p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500" required /></div>
              </div>
              <div><label className="font-bold text-neutral-300 block mb-1">Severity</label><select value={severity} onChange={e => setSeverity(e.target.value as TrafficSeverity)} className="w-full p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500"><option value={TrafficSeverity.LOW}>LOW</option><option value={TrafficSeverity.MEDIUM}>MEDIUM</option><option value={TrafficSeverity.HIGH}>HIGH</option><option value={TrafficSeverity.CRITICAL}>CRITICAL</option></select></div>
              <div><label className="font-bold text-neutral-300 block mb-1">Description</label><textarea rows={2} value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2.5 bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl">Cancel</button><button type="submit" className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl">Publish</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
