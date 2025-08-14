// frontend/src/pages/ChangePassword.jsx
import React, { useState, useEffect } from "react";
import { useToast } from "../contexts/ToastContext";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import apiClient from "../api/apiClient";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function ChangePassword() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const uid = searchParams.get("uid");
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid || !token) {
      showToast("Enlace de recuperación inválido", "error");
      navigate("/password-reset-request");
    }
  }, [uid, token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("Las contraseñas no coinciden", "error");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/users/password-reset-confirm/", {
        uid,
        token,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      showToast("Contraseña cambiada correctamente", "success");
      navigate("/login");
    } catch (err) {
      console.error(err);
      showToast("Error al cambiar la contraseña", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-indigo-50 via-white to-pink-50 flex flex-col justify-center items-center px-6">
      {/* Header like login page */}
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

      {/* Change Password form */}
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-2xl rounded-3xl p-10 max-w-md w-full ring-1 ring-indigo-100 space-y-6"
      >
        <h2 className="text-2xl font-semibold text-gray-700 text-center mb-6">
          Cambiar contraseña
        </h2>

        <div>
          <label className="block mb-2 font-semibold text-gray-700">
            Nueva contraseña
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-transparent transition shadow-md"
          />
        </div>

        <div>
          <label className="block mb-2 font-semibold text-gray-700">
            Confirmar nueva contraseña
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full px-5 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:border-transparent transition shadow-md"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-3 rounded-3xl shadow-lg transition-transform active:scale-95"
        >
          {loading ? <LoadingSpinner /> : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}
