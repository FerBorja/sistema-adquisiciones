// frontend/src/pages/PasswordResetRequest.jsx
import React, { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import apiClient from '../api/apiClient';
import { useNavigate } from 'react-router-dom';

export default function PasswordResetRequest() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post('/users/password-reset/', { email });
      showToast('Se ha enviado un enlace de recuperación a tu correo', 'success');
      navigate('/login');
    } catch (err) {
      console.error(err);
      showToast('Error al enviar el correo', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-indigo-50 via-white to-pink-50 flex flex-col justify-center items-center px-6">
      
      {/* Header - matches login page */}
      <div className="text-center mb-12 max-w-lg">
        <img
          src={`${process.env.PUBLIC_URL}/images/uach_logo.png`}
          alt="UACH Logo"
          className="mx-auto mb-6 w-32 h-auto"
        />
        <h1 className="text-4xl font-extrabold text-indigo-700 mb-3">
          Sistema Integral de Adquisiciones
        </h1>
        <p className="text-lg text-indigo-600 leading-relaxed">
          Facultad de Ingeniería<br />
          Universidad Autónoma de Chihuahua.
        </p>
      </div>

      {/* Password reset form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-10 rounded-3xl shadow-2xl max-w-md w-full space-y-6"
      >
        <h2 className="text-2xl font-semibold text-center text-gray-700">
          Recuperar contraseña
        </h2>

        <div>
          <label className="block mb-2 font-semibold text-gray-700">
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-indigo-300"
            placeholder="Ingresa tu correo universitario"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-600 to-pink-500 text-white font-bold py-3 rounded-3xl shadow-lg"
        >
          {loading ? 'Enviando...' : 'Enviar enlace'}
        </button>
      </form>
    </div>
  );
}
