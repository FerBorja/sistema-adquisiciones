// frontend/src/components/Layout/Navbar.jsx
import React, { useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

export default function Navbar({ minimal = false }) {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Pages where the navbar should be hidden
  const hiddenPaths = [
    '/login',
    '/register',
    '/password-reset-request',
    '/change-password'
  ];

  // Hide navbar completely on certain paths
  if (hiddenPaths.includes(location.pathname)) return null;

  const handleLogout = () => {
    logout();
    navigate('/login'); // Redirect after logout
  };

  // Minimal navbar version
  if (minimal) {
    return (
      <nav className="bg-indigo-50 border-b border-indigo-200 p-4 flex justify-end items-center">
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

  // Full navbar version
  return (
    <nav className="bg-indigo-50 border-b border-indigo-200 p-4 flex justify-between items-center">
      <div className="flex gap-4">
        {user && (
          <>
            <Link to="/" className="font-bold text-lg text-indigo-700">Home</Link>
            <Link to="/about" className="font-bold text-lg text-indigo-700">About</Link>
            <Link to="/requisitions" className="font-bold text-lg text-indigo-700">Requisitions</Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-indigo-700 font-semibold">Welcome, {user.first_name}</span>
            <button
              onClick={handleLogout}
              className="bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-2 px-4 rounded-3xl shadow-lg transition-transform active:scale-95"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="mr-4 text-indigo-700 font-semibold">Login</Link>
            <Link to="/register" className="text-indigo-700 font-semibold">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
