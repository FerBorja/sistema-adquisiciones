// frontend/src/App.jsx
import React, { useContext } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, AuthContext } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";

import Navbar from "./components/Layout/Navbar";
import Footer from "./components/Layout/Footer";
import ToastNotification from "./components/UI/ToastNotification";

import Home from "./pages/Home";
import About from "./pages/About";
import Login from "./pages/Login";
import Register from "./pages/Register";
import RequisitionList from "./components/Requisitions/RequisitionList";
import RequisitionForm from "./components/Requisitions/RequisitionForm";
import RequisitionDetail from "./pages/RequisitionDetail";
import NotFound from "./pages/NotFound";
import ChangePassword from "./pages/ChangePassword";
import PasswordResetRequest from './pages/PasswordResetRequest';
import RequisitionsListPage from "./pages/RequisitionsList";
import RequisitionsLayout from './components/Layout/RequisitionsLayout';
import RequisitionsList from './pages/RequisitionsList';

import PrivateRoute from "./routes/PrivateRoute";

function Layout() {
  const location = useLocation();
  const { token } = useContext(AuthContext);

  // Hide Navbar and Footer on login, register, and change-password pages
  const requisitionsPages = [
    "/requisitions",
    "/requisitions/new",
    // Add more requisition routes if needed
  ];
  const hideNavbar = ["/login", "/register", "/change-password", ...requisitionsPages].includes(location.pathname);


  return (
    <div className="flex flex-col min-h-screen">
      {!hideNavbar && <Navbar />}
      <main className="flex-1 p-4">
        <Routes>
          {/* Redirect from root depending on auth */}
          <Route
            path="/"
            element={
              token ? <Navigate to="/requisitions" replace /> : <Navigate to="/login" replace />
            }
          />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/password-reset-request" element={<PasswordResetRequest />} />
          <Route path="/password-reset-confirm/:uid/:token" element={<ChangePassword />} />
          <Route path="/change-password" element={<ChangePassword />} />
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

          <Route
            path="/requisitions/new"
            element={
              <PrivateRoute>
                <RequisitionsLayout>
                  <RequisitionForm />
                </RequisitionsLayout>
              </PrivateRoute>
            }
          />
          <Route
            path="/requisitions"
            element={
              <PrivateRoute>
                <RequisitionsListPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/requisitions/new"
            element={
              <PrivateRoute>
                <RequisitionForm />
              </PrivateRoute>
            }
          />
          <Route
            path="/requisitions/:id"
            element={
              <PrivateRoute>
                <RequisitionDetail />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
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
