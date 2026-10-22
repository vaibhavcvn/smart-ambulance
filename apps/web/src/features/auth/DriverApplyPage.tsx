import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../lib/api-client.js';
import { Ambulance, ShieldAlert, CheckCircle2, AlertCircle, FileText, Lock, Mail, Phone, User, Truck, ArrowLeft } from 'lucide-react';

export const DriverApplyPage: React.FC = () => {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [vehicleTypeRequested, setVehicleTypeRequested] = useState<'ALS' | 'BLS' | 'PATIENT_TRANSPORT'>('ALS');
  const [vehicleRegistrationRequested, setVehicleRegistrationRequested] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await api.post('/api/v1/drivers/apply', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        licenseNumber: licenseNumber.trim(),
        vehicleTypeRequested,
        vehicleRegistrationRequested: vehicleRegistrationRequested.trim(),
      });

      setIsSubmitted(true);
    } catch (err: any) {
      setErrorMessage(err.message || 'Driver application submission failed. Email may already be registered.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="min-h-[calc(100dvh-48px)] flex items-center justify-center px-4 pt-4 pb-28 sm:py-8 bg-neutral-950 font-sans text-neutral-100">
        <div className="max-w-md w-full bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-800 p-6 sm:p-8 text-center space-y-5 my-auto">
          <div className="w-16 h-16 bg-blue-950/80 text-blue-400 border border-blue-800 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-blue-950/40">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <span className="text-[10px] uppercase font-black tracking-wider px-3 py-1 bg-amber-950 text-amber-300 rounded-full border border-amber-800 inline-block mb-2">
              Status: PENDING_REVIEW
            </span>
            <h2 className="text-xl font-black text-white">Application Submitted!</h2>
            <p className="text-xs text-neutral-300 mt-2 leading-relaxed">
              Thank you, <strong>{name}</strong>. Your driver onboarding application has been registered in the Aurangabad
              Emergency Dispatch database.
            </p>
          </div>

          <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-2xl text-left text-xs text-neutral-400 space-y-2">
            <span className="font-bold text-white block flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Next Steps & Security Verification</span>
            </span>
            <p className="text-[11px]">
              1. The designated <strong>System Administrator</strong> will inspect your commercial license (
              <strong className="text-neutral-200">{licenseNumber}</strong>) and verify vehicle availability.
            </p>
            <p className="text-[11px]">
              2. While pending, you can log in to check your review status. <strong>Operational dispatch offers</strong> and <strong>live GPS telemetry</strong> remain locked until approval.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg transition-all"
            >
              Sign In to Check Status
            </button>
            <Link to="/" className="text-xs text-neutral-400 hover:text-white">
              Return to Homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-48px)] flex items-center justify-center px-4 pt-4 pb-28 sm:py-8 bg-neutral-950 font-sans text-neutral-100">
      <div className="max-w-lg w-full bg-neutral-900 rounded-3xl shadow-2xl border border-neutral-800 p-5 sm:p-8 my-auto">
        <Link to="/login" className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>

        <div>
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-900/40">
            <Ambulance className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white mt-4 tracking-tight">Ambulance Driver Onboarding</h2>
          <p className="text-xs text-neutral-400 mt-1">
            Apply to operate in the Aurangabad Emergency Medical Service (EMS) intelligent fleet
          </p>
        </div>

        {/* Verification Policy */}
        <div className="mt-4 p-3 bg-amber-950/40 border border-amber-800/80 rounded-xl text-[11px] text-amber-200">
          <strong>Mandatory Verification:</strong> Submitted driver applications are placed in{' '}
          <span className="font-bold underline">PENDING_REVIEW</span>. The administrator will inspect your license and
          assign an approved vehicle before dispatch activation.
        </div>

        {errorMessage && (
          <div className="mt-4 p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-extrabold text-neutral-300 block mb-1">Driver Full Name</label>
              <div className="relative">
                <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Shinde"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  placeholder="driver@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-extrabold text-neutral-300 block mb-1">Phone Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98230 11111"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-extrabold text-neutral-300 block mb-1">Account Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full pl-9 pr-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-800 pt-3">
            <span className="text-xs font-extrabold text-neutral-200 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>License & Vehicle Request</span>
            </span>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-extrabold text-neutral-300 block mb-1">Commercial Driver License #</label>
                <input
                  type="text"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  placeholder="e.g. MH20-2023-0091823"
                  className="w-full px-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-extrabold text-neutral-300 block mb-1">Ambulance Category</label>
                  <select
                    value={vehicleTypeRequested}
                    onChange={(e: any) => setVehicleTypeRequested(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  >
                    <option value="ALS">ALS — Advanced Life Support (ICU)</option>
                    <option value="BLS">BLS — Basic Life Support</option>
                    <option value="PATIENT_TRANSPORT">Patient Transport Service (PTS)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-extrabold text-neutral-300 block mb-1">Requested Vehicle Registration</label>
                  <div className="relative">
                    <Truck className="w-4 h-4 text-neutral-500 absolute left-3 top-3.5" />
                    <input
                      type="text"
                      value={vehicleRegistrationRequested}
                      onChange={(e) => setVehicleRegistrationRequested(e.target.value)}
                      placeholder="e.g. MH-20-EM-1080"
                      className="w-full pl-9 pr-3 py-2.5 text-xs bg-neutral-950 border border-neutral-700 rounded-xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/40 transition-all disabled:opacity-50 mt-4"
          >
            {isSubmitting ? 'Submitting Application...' : 'Submit Driver Application'}
          </button>
        </form>
      </div>
    </div>
  );
};
