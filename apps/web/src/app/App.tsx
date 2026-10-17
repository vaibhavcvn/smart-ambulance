import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '../hooks/use-auth.js';
import { Navbar } from '../components/layout/Navbar.js';
import { PatientBookingPage } from '../features/patient/PatientBookingPage.js';
import { DriverConsolePage } from '../features/driver/DriverConsolePage.js';
import { HospitalPortalPage } from '../features/hospital/HospitalPortalPage.js';
import { TrafficPolicePage } from '../features/police/TrafficPolicePage.js';
import { AdminDashboardPage } from '../features/admin/AdminDashboardPage.js';
import { LoginPage } from '../features/auth/LoginPage.js';
import { RegisterPage } from '../features/auth/RegisterPage.js';
import { DriverApplyPage } from '../features/auth/DriverApplyPage.js';
import { UserRole } from '@aurangabad-ambulance/shared';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-88px)] flex items-center justify-center bg-neutral-950 text-neutral-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-neutral-400">Authenticating Terminal...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div className="max-w-md mx-auto my-16 p-6 bg-neutral-900 rounded-2xl border border-red-900/60 text-center shadow-2xl text-neutral-100">
        <h2 className="text-base font-bold text-red-500">Access Restricted</h2>
        <p className="text-xs text-neutral-400 mt-2">
          Your current account role (<strong className="text-white">{user.role}</strong>) is not authorized for this
          interface. Please sign in with an eligible role account.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans">
            <Navbar />
            <main className="flex-1">
              <Routes>
                <Route path="/" element={<PatientBookingPage />} />
                <Route
                  path="/driver"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.DRIVER, UserRole.ADMIN]}>
                      <DriverConsolePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/hospital"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.HOSPITAL_STAFF, UserRole.ADMIN]}>
                      <HospitalPortalPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/police"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.TRAFFIC_POLICE, UserRole.ADMIN]}>
                      <TrafficPolicePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                      <AdminDashboardPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/driver/apply" element={<DriverApplyPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};
