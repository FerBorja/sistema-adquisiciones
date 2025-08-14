import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

export default function Login() {
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      await login({ employee_number: employeeNumber, password });
      navigate('/requisitions'); // Redirect after login
    } catch (err) {
      console.error('Login failed:', err);
      setError('Credenciales inválidas. Intente de nuevo.');
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gradient-to-tr from-indigo-50 via-white to-pink-50 flex flex-col justify-center items-center px-6">
      {/* Header */}
      <div className="text-center mb-12 max-w-lg">
        <img
          src={`${process.env.PUBLIC_URL}/images/uach_logo.png`}
          alt="UACH Logo"
          className="mx-auto mb-6 w-32 h-auto"
        />
        <h1 className="text-5xl font-extrabold text-indigo-700 drop-shadow-md mb-3">
          Sistema Integral de Adquisiciones
        </h1>
        <p className="text-xl text-indigo-600 leading-relaxed tracking-wide">
          Facultad de Ingeniería<br />
          Universidad Autónoma de Chihuahua.
        </p>
      </div>

      {/* Login form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-2xl rounded-3xl p-10 max-w-md w-full ring-1 ring-indigo-100"
      >
        {error && (
          <div className="bg-red-100 text-red-700 border border-red-300 rounded-md px-5 py-3 mb-6 text-center font-semibold tracking-wide shadow-sm">
            {error}
          </div>
        )}

        <div className="mb-6">
          <label
            htmlFor="employeeNumber"
            className="block mb-2 font-semibold text-gray-700 tracking-wide"
          >
            Número de Empleado
          </label>
          <input
            id="employeeNumber"
            type="text"
            value={employeeNumber}
            onChange={(e) => setEmployeeNumber(e.target.value)}
            className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-transparent transition shadow-md"
            placeholder="Ingrese su número de empleado"
            required
            autoComplete="username"
          />
        </div>

        <div className="mb-8">
          <label
            htmlFor="password"
            className="block mb-2 font-semibold text-gray-700 tracking-wide"
          >
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-transparent transition shadow-md"
            placeholder="Ingrese su contraseña"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-3 rounded-3xl shadow-lg transition-transform active:scale-95 mb-4"
        >
          Entrar
        </button>

        <Link
          to="/register"
          className="block text-center text-indigo-700 font-semibold hover:underline"
        >
          ¿No tienes una cuenta? Regístrate
        </Link>
        <Link
          to="/password-reset-request"
          className="block text-center text-indigo-700 font-semibold hover:underline"
        >
          ¿Olvidaste tu contraseña? Cambiar contraseña
        </Link>      
      </form>
    </div>
  );
}
