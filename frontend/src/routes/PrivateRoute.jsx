// frontend/src/routes/PrivateRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../contexts/AuthContext";

export default function PrivateRoute({ children, roles }) {
  const { user, loading } = React.useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return <div className="p-4">Cargando…</div>;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If roles are provided, enforce them. Also consider Django flags (staff/superuser)
  if (roles && roles.length > 0) {
    const isAdminish =
      user?.role === "admin" ||
      user?.role === "superuser" ||
      user?.is_staff === true ||
      user?.is_superuser === true;

    const isAllowed = isAdminish || roles.includes(user?.role);
    if (!isAllowed) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
}
