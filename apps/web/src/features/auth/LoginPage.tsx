import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth.js';
import { UserRole } from '@aurangabad-ambulance/shared';
import { Ambulance, Lock, Mail, AlertCircle, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

interface DemoAccount {
  label: string;
  role: string;
  email: string;
  pass: string;
  color: string;
  destination: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    label: 'Patient (Booking)',
    role: 'PATIENT',
    email: 'patient@aurangabad-ems.local',
    pass: 'Patient@12345',
    color: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 hover:bg-emerald-900/60',
    destination: '/',
  },
  {
    label: 'Driver Ramesh (ALS)',
    role: 'DRIVER',
    email: 'driver.ramesh@aurangabad-ems.local',
    pass: 'Driver@12345',
    color: 'bg-blue-950/60 text-blue-300 border-blue-800/80 hover:bg-blue-900/60',
    destination: '/driver',
  },
  {
    label: 'Driver Sunil (BLS)',
    role: 'DRIVER',
    email: 'driver.sunil@aurangabad-ems.local',
    pass: 'Driver@12345',
    color: 'bg-sky-950/60 text-sky-300 border-sky-800/80 hover:bg-sky-900/60',
    destination: '/driver',
  },
  {
    label: 'Hospital Ghati ER',
    role: 'HOSPITAL_STAFF',
    email: 'staff.ghati@aurangabad-ems.local',
    pass: 'Hospital@12345',
    color: 'bg-teal-950/60 text-teal-300 border-teal-800/80 hover:bg-teal-900/60',
    destination: '/hospital',
  },
  {
    label: 'Hospital MGM ER',
    role: 'HOSPITAL_STAFF',
    email: 'staff.mgm@aurangabad-ems.local',
    pass: 'Hospital@12345',
    color: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/80 hover:bg-cyan-900/60',
    destination: '/hospital',
  },
  {
    label: 'Traffic Police',
    role: 'TRAFFIC_POLICE',
    email: 'police.control@aurangabad-ems.local',
    pass: 'Police@12345',
    color: 'bg-amber-950/60 text-amber-300 border-amber-800/80 hover:bg-amber-900/60',
    destination: '/police',
  },
  {
    label: 'System Admin',
    role: 'ADMIN',
    email: 'admin@aurangabad-ems.gov.in',
    pass: 'Admin@12345',
    color: 'bg-purple-950/60 text-purple-300 border-purple-800/80 hover:bg-purple-900/60',
    destination: '/admin',
  },
];

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const user = await login({ email, password });
      switch (user.role) {
        case UserRole.DRIVER:
          navigate('/driver');
          break;
        case UserRole.HOSPITAL_STAFF:
          navigate('/hospital');
          break;
        case UserRole.TRAFFIC_POLICE:
          navigate('/police');
          break;
        case UserRole.ADMIN:
          navigate('/admin');
          break;
        default:
          navigate('/');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (account: DemoAccount) => {
    setEmail(account.email);
    setPassword(account.pass);
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await login({ email: account.email, password: account.pass });
      navigate(account.destination);
    } catch (err: any) {
      setErrorMessage(err.message || 'Auto-login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-88px)] flex items-center justify-center p-4 bg-neutral-950 font-sans text-neutral-100">
      <div className="max-w-md w-full bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-800 p-7 sm:p-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-600 rounded-2xl mx-auto flex items-center justify-center text-white shadow-xl shadow-red-900/40">
            <Ambulance className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white mt-4 tracking-tight">Platform Sign In</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Aurangabad Smart Emergency Dispatch & Traffic Coordination
          </p>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Quick Demo Role Fillers */}
        <div className="mt-6">
          <span className="text-xs font-black text-neutral-300 uppercase tracking-wider block mb-2.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Instant Demo Logins (1-Click)</span>
          </span>

          <div className="grid grid-cols-2 gap-1.5">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => handleQuickLogin(acc)}
                className={`text-left p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-between ${acc.color}`}
              >
                <span className="truncate pr-1">{acc.label}</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-70" />
              </button>
            ))}
          </div>
        </div>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800"></div>
          </div>
          <div className="relative flex justify-center text-[11px] text-neutral-500 uppercase tracking-wider">
            <span className="bg-neutral-900 px-3">Or enter credentials</span>
          </div>
        </div>

        {/* Standard Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-extrabold text-neutral-300 block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@aurangabad-ems.local"
                className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-neutral-300 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl shadow-lg shadow-red-900/40 transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-neutral-800 flex flex-col gap-2 text-center text-xs text-neutral-400">
          <div>
            Need emergency booking?{' '}
            <Link to="/register" className="text-red-400 font-bold hover:underline">
              Register as Patient
            </Link>
          </div>
          <div>
            Commercial ambulance driver?{' '}
            <Link to="/driver/apply" className="text-blue-400 font-bold hover:underline">
              Apply for Driver Onboarding &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
