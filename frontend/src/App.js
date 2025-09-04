// frontend/src/App.jsx
import React, { useContext } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, AuthContext } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";

import Navbar from "./components/Layout/Navbar";
import Footer from "./components/Layout/Footer";
import ToastNotification from "./components/UI/ToastNotification";

import About from "./pages/About";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ChangePassword from "./pages/ChangePassword";
import PasswordResetRequest from "./pages/PasswordResetRequest";
import RequisitionDetail from "./pages/RequisitionDetail";

import RequisitionsLayout from "./components/Layout/RequisitionsLayout";
import RequisitionsList from "./pages/RequisitionsList";
import RequisitionWizard from "./components/Requisitions/RequisitionWizard";
import RequisitionEdit from "./pages/RequisitionEdit";
import Reports from "./pages/Reports";

import PrivateRoute from "./routes/PrivateRoute";

/* ────────────────────────────────────────────────────────────────────────────
   Public layout: shows global Navbar/Footer for public routes only
--------------------------------------------------------------------------- */
function PublicLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 p-4">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

/* Root redirect: if logged in → /requisitions; else → /login */
function RootRedirect() {
  const { token } = useContext(AuthContext);
  return token ? <Navigate to="/requisitions" replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Root redirect based on auth */}
          <Route path="/" element={<RootRedirect />} />

          {/* Public routes under global Navbar/Footer */}
          <Route element={<PublicLayout />}>
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/password-reset-request" element={<PasswordResetRequest />} />
            <Route path="/password-reset-confirm/:uid/:token" element={<ChangePassword />} />
            <Route path="/change-password" element={<ChangePassword />} />
          </Route>

          {/* Private routes that SHARE the same Navbar + Sidebar (RequisitionsLayout) */}
          <Route
            element={
              <PrivateRoute>
                <RequisitionsLayout />
              </PrivateRoute>
            }
          >
            <Route path="/requisitions" element={<RequisitionsList />} />
            <Route path="/requisitions/new" element={<RequisitionWizard />} />
            <Route path="/requisitions/edit/:id" element={<RequisitionEdit />} />
            <Route path="/requisitions/:id" element={<RequisitionDetail />} />
            {/* ✅ Reports now uses the same layout (same Navbar/Sidebar) */}
            <Route path="/reports" element={<Reports />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Toasts mounted once at root */}
        <ToastNotification />
      </AuthProvider>
    </ToastProvider>
  );
}
