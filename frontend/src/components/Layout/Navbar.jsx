// frontend/src/components/Layout/Navbar.jsx
import React, { useContext } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";

export default function Navbar({ minimal = false }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  const hiddenPaths = ["/login", "/register", "/password-reset-request", "/change-password"];
  if (hiddenPaths.includes(location.pathname)) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Minimal navbar (no cambia)
  if (minimal) {
    return (
      <nav className="bg-indigo-50 border-b border-indigo-200 p-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2">
          <img src="/images/uach_logo.png" alt="UACH Logo" className="h-10 w-auto object-contain" />
        </Link>

        {user && (
          <div className="flex items-center gap-4">
            <span className="text-indigo-700 font-semibold">Bienvenido, {user.first_name}</span>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-2 px-4 rounded-3xl shadow-lg transition-transform active:scale-95"
            >
              Salir
            </button>
          </div>
        )}
      </nav>
    );
  }

  // Full navbar (limpio: solo logo + sesión)
  return (
    <nav className="bg-indigo-50 border-b border-indigo-200 p-4 flex justify-between items-center">
      <div className="flex items-center gap-6">
        <Link to="/requisitions" className="flex items-center gap-2">
          <img src="/images/uach_logo.png" alt="UACH Logo" className="h-10 w-auto object-contain" />
        </Link>
      </div>

      {user && (
        <div className="flex items-center gap-4">
          <span className="text-indigo-700 font-semibold">Bienvenido, {user.first_name}</span>
          <button
            onClick={handleLogout}
            className="bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-2 px-4 rounded-3xl shadow-lg transition-transform active:scale-95"
          >
            Salir
          </button>
        </div>
      )}
    </nav>
  );
}
