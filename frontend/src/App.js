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
import Register from "./pages/Register"; // New public route
import RequisitionList from "./components/Requisitions/RequisitionList";
import RequisitionForm from "./components/Requisitions/RequisitionForm";
import RequisitionDetail from "./pages/RequisitionDetail";
import NotFound from "./pages/NotFound";

import PrivateRoute from "./routes/PrivateRoute";

function Layout() {
  const location = useLocation();
  const { token } = useContext(AuthContext);

  // Hide Navbar on login and register pages
  const hideNavbar = location.pathname === "/login" || location.pathname === "/register";

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
          <Route path="/register" element={<Register />} /> {/* New public route */}
          <Route
            path="/requisitions"
            element={
              <PrivateRoute>
                <RequisitionList />
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
      <Footer />
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
