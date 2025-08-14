import React, { useContext } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';

export default function Navbar() {
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

  // Hide navbar on certain paths
  if (hiddenPaths.includes(location.pathname)) return null;

  const handleLogout = () => {
    logout();
    navigate('/login'); // Redirect after logout
  };

  return (
    <nav className="bg-blue-600 text-white p-4 flex justify-between items-center">
      <div className="space-x-4">
        {user && (
          <>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
            <Link to="/requisitions">Requisitions</Link>
          </>
        )}
      </div>
      <div>
        {user ? (
          <>
            <span className="mr-4">Welcome, {user.first_name}</span>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 px-3 py-1 rounded"
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="mr-4">Login</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </div>
    </nav>
  );
}
