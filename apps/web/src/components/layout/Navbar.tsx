import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth.js';
import {
  Ambulance,
  Building2,
  ShieldAlert,
  BarChart3,
  LogOut,
  User as UserIcon,
  Navigation,
  Activity,
  Phone,
  HelpCircle,
  X,
  ExternalLink,
  ChevronDown,
  BedDouble,
  HeartPulse,
} from 'lucide-react';
import { UserRole } from '@aurangabad-ambulance/shared';

// Aurangabad Hospitals Directory for quick reference
const AURANGABAD_HOSPITALS_LIST = [
  {
    name: 'Government Medical College & Hospital (GMCH / Ghati)',
    address: 'Jubilee Park, Panchakki Road, Aurangabad',
    phone: '0240-2402412',
    emergencyBeds: 24,
    icuBeds: 12,
    hasTrauma: true,
    hasStroke: true,
    type: 'Government Apex Tertiary Care',
  },
  {
    name: 'Apex Super Speciality Hospital & Trauma Center',
    address: 'Near Seven Hills Flyover, Jalna Road, Aurangabad',
    phone: '0240-2345678',
    emergencyBeds: 8,
    icuBeds: 6,
    hasTrauma: true,
    hasStroke: true,
    type: 'Super Speciality Trauma',
  },
  {
    name: 'Dhoot Hospital',
    address: 'Airport Road, Chittegaon, Jalna Road, Aurangabad',
    phone: '0240-2478500',
    emergencyBeds: 10,
    icuBeds: 8,
    hasTrauma: true,
    hasStroke: false,
    type: 'Multi-Speciality Tertiary',
  },
  {
    name: 'MGM Medical College & Hospital',
    address: 'N-6, CIDCO, Jalna Road, Aurangabad',
    phone: '0240-6601100',
    emergencyBeds: 16,
    icuBeds: 10,
    hasTrauma: true,
    hasStroke: true,
    type: 'Teaching & Emergency Hospital',
  },
  {
    name: 'Medicover Hospital',
    address: 'Seven Hills, Jalna Road, Aurangabad',
    phone: '0240-6711111',
    emergencyBeds: 6,
    icuBeds: 4,
    hasTrauma: false,
    hasStroke: true,
    type: 'Cardiac & Multi-Speciality',
  },
];

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [showHospitalsModal, setShowHospitalsModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  const getRoleBadge = (role?: UserRole) => {
    switch (role) {
      case UserRole.ADMIN:
        return 'bg-purple-950 text-purple-300 border-purple-800';
      case UserRole.DRIVER:
        return 'bg-blue-950 text-blue-300 border-blue-800';
      case UserRole.HOSPITAL_STAFF:
        return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case UserRole.TRAFFIC_POLICE:
        return 'bg-amber-950 text-amber-300 border-amber-800';
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Top Academic Disclosure Banner - Sleek Minimalist Bar */}
      <div className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 text-[11px] py-1 px-4 text-center font-medium tracking-wide flex items-center justify-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
        <span>
          <strong className="text-amber-300">ACADEMIC / DEVELOPMENT PROTOTYPE:</strong> Aurangabad EMS
          Intelligent Dispatch Platform. Not connected to physical traffic lights or real 112/108 hardware.
        </span>
      </div>

      {/* Main Uber-Inspired Navigation Bar */}
      <header className="sticky top-0 z-40 bg-neutral-950 border-b border-neutral-800 shadow-md backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Left: Brand / Logo */}
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-900/40 group-hover:bg-red-500 transition-all">
                <Ambulance className="w-5 h-5 text-white" />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-none group-hover:text-red-400 transition-colors">
                    Aurangabad EMS
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-950 text-red-400 border border-red-800/80 rounded">
                    Smart Dispatch
                  </span>
                </div>
                <span className="text-[11px] text-neutral-400 font-medium tracking-wide mt-0.5">
                  Chhatrapati Sambhajinagar Rapid Response
                </span>
              </div>
            </Link>

            {/* Center: Primary Uber-Style Navigation Links */}
            <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
              <Link
                to="/"
                className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
                  isActive('/')
                    ? 'bg-neutral-800 text-white shadow-inner border border-neutral-700'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <Navigation className="w-3.5 h-3.5 text-red-500" />
                <span>Book Emergency</span>
              </Link>

              <Link
                to="/"
                onClick={() => {
                  // Smoothly scroll to tracking card or trigger focus
                  const el = document.getElementById('tracking-card');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-1.5 ${
                  isActive('/#tracking')
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-900'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Tracking</span>
              </Link>

              <button
                type="button"
                onClick={() => setShowHospitalsModal(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold tracking-wide text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all flex items-center gap-1.5"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Hospitals</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSupportModal(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold tracking-wide text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all flex items-center gap-1.5"
              >
                <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Support</span>
              </button>

              {/* Role Portals Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold tracking-wide text-neutral-300 hover:text-white hover:bg-neutral-900 transition-all flex items-center gap-1 border border-neutral-800"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                  <span>Portals</span>
                  <ChevronDown className="w-3 h-3 text-neutral-400 ml-0.5" />
                </button>

                {showRoleDropdown && (
                  <div
                    className="absolute right-0 mt-2 w-52 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl py-1.5 z-50 divide-y divide-neutral-800"
                    onMouseLeave={() => setShowRoleDropdown(false)}
                  >
                    <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                      Role Workspaces
                    </div>
                    <div className="py-1">
                      <Link
                        to="/driver"
                        onClick={() => setShowRoleDropdown(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white"
                      >
                        <Ambulance className="w-4 h-4 text-blue-400" />
                        <span>Driver Console</span>
                      </Link>
                      <Link
                        to="/hospital"
                        onClick={() => setShowRoleDropdown(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white"
                      >
                        <Building2 className="w-4 h-4 text-emerald-400" />
                        <span>Hospital ER Portal</span>
                      </Link>
                      <Link
                        to="/police"
                        onClick={() => setShowRoleDropdown(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white"
                      >
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span>Traffic Police</span>
                      </Link>
                      <Link
                        to="/admin"
                        onClick={() => setShowRoleDropdown(false)}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-800 hover:text-white"
                      >
                        <BarChart3 className="w-4 h-4 text-purple-400" />
                        <span>Admin & Analytics</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </nav>

            {/* Right: Authenticated User Menu or Sign In */}
            <div className="flex items-center space-x-3">
              {user ? (
                <div className="flex items-center space-x-2.5">
                  <div className="flex flex-col text-right hidden sm:block">
                    <span className="text-xs font-bold text-white leading-tight">
                      {user.name}
                    </span>
                    <span
                      className={`mt-0.5 inline-block text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${getRoleBadge(
                        user.role
                      )}`}
                    >
                      {user.role}
                    </span>
                  </div>

                  <button
                    onClick={logout}
                    title="Sign Out"
                    className="p-2 text-neutral-400 hover:text-red-400 hover:bg-neutral-900 rounded-lg transition-colors border border-neutral-800"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-lg shadow-sm transition-all shadow-red-900/30"
                >
                  <UserIcon className="w-3.5 h-3.5 mr-1.5" />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* AURANGABAD HOSPITALS DIRECTORY MODAL */}
      {showHospitalsModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 text-neutral-100 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Aurangabad Emergency Hospitals</h3>
                  <p className="text-xs text-neutral-400">
                    Live Emergency Dept & ICU Network &bull; Chhatrapati Sambhajinagar
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHospitalsModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 divide-y divide-neutral-800/80">
              {AURANGABAD_HOSPITALS_LIST.map((h, i) => (
                <div key={i} className={i > 0 ? 'pt-3.5' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-white">{h.name}</h4>
                      <p className="text-xs text-neutral-400 mt-0.5">{h.address}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-neutral-800 text-neutral-300 rounded border border-neutral-700">
                          {h.type}
                        </span>
                        {h.hasTrauma && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-red-950 text-red-300 rounded border border-red-800/70">
                            Trauma Center
                          </span>
                        )}
                        {h.hasStroke && (
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-950 text-blue-300 rounded border border-blue-800/70">
                            Stroke Unit
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="text-center px-2 py-1 bg-neutral-800/80 rounded border border-neutral-700/80">
                          <span className="text-[10px] text-neutral-400 block">ER Beds</span>
                          <span className="text-xs font-bold text-red-400">{h.emergencyBeds}</span>
                        </div>
                        <div className="text-center px-2 py-1 bg-neutral-800/80 rounded border border-neutral-700/80">
                          <span className="text-[10px] text-neutral-400 block">ICU Beds</span>
                          <span className="text-xs font-bold text-blue-400">{h.icuBeds}</span>
                        </div>
                      </div>
                      <a
                        href={`tel:${h.phone.replace(/[^0-9]/g, '')}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 mt-2"
                      >
                        <Phone className="w-3 h-3" />
                        <span>{h.phone}</span>
                      </a>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 text-[11px] text-neutral-400 text-center flex items-center justify-center gap-1">
              <span>Automatic dynamic routing selects the optimal hospital during active dispatch.</span>
            </div>
          </div>
        </div>
      )}

      {/* 24/7 SUPPORT & HELPLINES MODAL */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 text-neutral-100 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 flex items-center justify-center">
                  <HeartPulse className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Emergency Support & Helplines</h3>
                  <p className="text-xs text-neutral-400">Aurangabad (Chhatrapati Sambhajinagar)</p>
                </div>
              </div>
              <button
                onClick={() => setShowSupportModal(false)}
                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              <a
                href="tel:108"
                className="flex items-center justify-between p-3.5 bg-red-950/40 border border-red-800/80 rounded-xl hover:bg-red-900/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center font-black text-sm">
                    108
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      Maharashtra State EMS Ambulance
                    </span>
                    <span className="text-xs text-red-300">Toll-Free &bull; 24x7 Rapid Medical Dispatch</span>
                  </div>
                </div>
                <Phone className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform" />
              </a>

              <a
                href="tel:112"
                className="flex items-center justify-between p-3.5 bg-neutral-800/60 border border-neutral-700/80 rounded-xl hover:bg-neutral-800 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                    112
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      National Emergency Helpline (ERSS)
                    </span>
                    <span className="text-xs text-neutral-300">Police, Fire & Unified Emergency</span>
                  </div>
                </div>
                <Phone className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
              </a>

              <a
                href="tel:02402240500"
                className="flex items-center justify-between p-3.5 bg-neutral-800/60 border border-neutral-700/80 rounded-xl hover:bg-neutral-800 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-600 text-white flex items-center justify-center font-black text-xs">
                    POLICE
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      Aurangabad City Police Control Room
                    </span>
                    <span className="text-xs text-neutral-300">Traffic Clearance & Law Enforcement</span>
                  </div>
                </div>
                <Phone className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              </a>

              <a
                href="tel:02402402412"
                className="flex items-center justify-between p-3.5 bg-neutral-800/60 border border-neutral-700/80 rounded-xl hover:bg-neutral-800 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs">
                    GMCH
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white block">
                      GMCH / Ghati Hospital Casualty Desk
                    </span>
                    <span className="text-xs text-neutral-300">Government Apex Medical College ER</span>
                  </div>
                </div>
                <Phone className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
              </a>
            </div>

            <div className="p-3 bg-neutral-950 border-t border-neutral-800 text-[11px] text-neutral-400 text-center">
              In severe life-threatening emergencies, always dial 108 or 112 directly.
            </div>
          </div>
        </div>
      )}
    </>
  );
};
