import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/use-auth.js';
import { UserRole } from '@aurangabad-ambulance/shared';
import { Ambulance, Lock, Mail, Phone, User, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Password and confirmation password do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
        role: UserRole.PATIENT,
      });

      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. The email may already be in use.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-88px)] flex items-center justify-center p-4 bg-neutral-950 font-sans text-neutral-100">
      <div className="max-w-md w-full bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-800 p-7 sm:p-8">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-600 rounded-2xl mx-auto flex items-center justify-center text-white shadow-xl shadow-red-900/40">
            <User className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white mt-4 tracking-tight">Create Patient Account</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Register to book emergency ambulances and track live dispatch across Aurangabad
          </p>
        </div>

        {/* Security & Role Policy Banner */}
        <div className="mt-4 p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-[11px] text-neutral-400 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-neutral-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Public Registration Policy</span>
          </div>
          <p>
            Public registration creates a verified <strong>PATIENT</strong> identity. Elevated operational roles
            are provisioned by the designated administrator.
          </p>
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <div>
            <label className="text-xs font-extrabold text-neutral-300 block mb-1">Full Name</label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ramesh Patil"
                className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-neutral-300 block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-neutral-300 block mb-1">Phone Number (Optional)</label>
            <div className="relative">
              <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-extrabold text-neutral-300 block mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 chars"
                  className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-extrabold text-neutral-300 block mb-1">Confirm Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                  required
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl shadow-lg shadow-red-900/40 transition-all disabled:opacity-50 mt-2"
          >
            {isSubmitting ? 'Creating Patient Account...' : 'Register as Patient'}
          </button>
        </form>

        {/* Driver Application Callout */}
        <div className="mt-6 p-4 bg-blue-950/30 border border-blue-800/60 rounded-2xl flex items-center justify-between">
          <div className="pr-2">
            <span className="text-xs font-bold text-blue-300 block flex items-center gap-1.5">
              <Ambulance className="w-3.5 h-3.5 text-blue-400" />
              <span>Are you an Ambulance Driver?</span>
            </span>
            <span className="text-[10px] text-neutral-400 block mt-0.5">
              Submit your driver application and license for administrator approval.
            </span>
          </div>
          <Link
            to="/driver/apply"
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shrink-0 flex items-center gap-1 shadow-md transition-colors"
          >
            <span>Apply</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <div className="mt-4 text-center">
          <span className="text-xs text-neutral-400">
            Already registered?{' '}
            <Link to="/login" className="text-red-400 font-bold hover:underline">
              Sign in to your account
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
};
