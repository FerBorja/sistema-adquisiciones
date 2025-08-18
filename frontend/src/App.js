// frontend/src/App.jsx
import React, { useContext } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
// ⬇️ NEW: use the wizard instead of the form directly
import RequisitionWizard from "./components/Requisitions/RequisitionWizard";

import PrivateRoute from "./routes/PrivateRoute";

function Layout() {
  const location = useLocation();
  const { token } = useContext(AuthContext);

  // Pages where we hide the global Navbar/Footer
  const requisitionsPages = ["/requisitions", "/requisitions/new"];
  const hideNavbar = ["/login", "/register", "/change-password", ...requisitionsPages].includes(location.pathname);

  return (
    <div className="flex flex-col min-h-screen">
      {!hideNavbar && <Navbar />}
      <main className="flex-1 p-4">
        <Routes>
          {/* Root redirect based on auth */}
          <Route
            path="/"
            element={token ? <Navigate to="/requisitions" replace /> : <Navigate to="/login" replace />}
          />

          {/* Public */}
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/password-reset-request" element={<PasswordResetRequest />} />
          <Route path="/password-reset-confirm/:uid/:token" element={<ChangePassword />} />
          <Route path="/change-password" element={<ChangePassword />} />

          {/* Requisitions list */}
          <Route
            path="/requisitions"
            element={
              <PrivateRoute>
                <RequisitionsLayout>
                  <RequisitionsList />
                </RequisitionsLayout>
              </PrivateRoute>
            }
          />

          {/* Requisition wizard (Step 1–3) */}
          <Route
            path="/requisitions/new"
            element={
              <PrivateRoute>
                <RequisitionsLayout>
                  <RequisitionWizard />
                </RequisitionsLayout>
              </PrivateRoute>
            }
          />

          {/* Requisition detail */}
          <Route
            path="/requisitions/:id"
            element={
              <PrivateRoute>
                <RequisitionsLayout>
                  <RequisitionDetail />
                </RequisitionsLayout>
              </PrivateRoute>
            }
          />

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!hideNavbar && <Footer />}
      <ToastNotification />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Layout />
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}
