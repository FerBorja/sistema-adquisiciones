// frontend/src/pages/Register.jsx
import React, { useState, useEffect } from "react";
import apiClient from "../api/apiClient";
import { useToast } from "../contexts/ToastContext";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState([]);

  const [formData, setFormData] = useState({
    employee_number: "",
    first_name: "",
    last_name: "",
    department: "",
    extension_number: "",
    email: "",
    password: "",
    confirm_password: "",
    code: "",
    profile_picture: null,
  });

  useEffect(() => {
    if (step === 2) {
      apiClient
        .get("/catalogs/departments/")
        .then((res) => setDepartments(res.data))
        .catch(() => showToast("Error cargando departamentos.", "error"));
    }
  }, [step, showToast]);

  const setRequiredMessage = (e, message) => {
    e.target.setCustomValidity(message);
    e.target.oninput = () => e.target.setCustomValidity("");
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: files ? files[0] : value,
    }));
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiClient.post("/users/send-code/", { email: formData.email });
      showToast("Código de registro enviado a tu Email", "success");
      setStep(2);
    } catch (err) {
      console.error(err);
      showToast("Error al enviar código de registro", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirm_password) {
      showToast("Las contraseñas no coinciden", "error");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        if (value) payload.append(key, value);
      });

      await apiClient.post("/users/register/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showToast("Registro exitoso! Ahora puedes loguearte", "success");
      navigate("/login");
    } catch (err) {
      console.error(err);
      showToast("Error al registrar, por favor revisa tus datos", "error");
    } finally {
      setLoading(false);
    }
  };

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
          Universidad Autónoma de Chihuahua
        </p>
      </div>

      {/* Form Card */}
      <div className="bg-white shadow-2xl rounded-3xl p-10 max-w-md w-full ring-1 ring-indigo-100">
        {step === 1 && (
          <>
            <h2 className="text-2xl font-semibold mb-4 text-gray-700 tracking-wide">Solicitar código de registro</h2>
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Email Universitario</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => {
                    if (!e.target.value) {
                      e.target.setCustomValidity("Por favor ingrese su correo universitario");
                    } else {
                      e.target.setCustomValidity("Por favor ingrese un correo válido (ejemplo@uach.mx)");
                    }
                  }}
                  onInput={(e) => e.target.setCustomValidity("")}
                  className="w-full border rounded p-2"
                  placeholder="Correo universitario"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-3 rounded-3xl shadow-lg transition-transform active:scale-95"
              >
                {loading ? <LoadingSpinner /> : "Enviar Código"}
              </button>
            </form>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-2xl font-extrabold mb-6 text-gray-700 tracking-wide">Completa el registro</h2>
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Código de registro */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Código de registro</label>
                <input
                  type="text"
                  name="code"
                  value={formData.code}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor ingrese el código de registro")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Número de empleado */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Número de empleado</label>
                <input
                  type="text"
                  name="employee_number"
                  value={formData.employee_number}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor ingrese su número de empleado")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Nombre */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Nombre</label>
                <input
                  type="text"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor ingrese su nombre")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Apellidos */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Apellidos</label>
                <input
                  type="text"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor ingrese sus apellidos")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Departamento */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Departamento</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor seleccione un departamento")}
                  className="w-full border rounded p-2"
                >
                  <option value="">Seleccionar Departamento</option>
                  {departments.map((dep) => (
                    <option key={dep.id} value={dep.name}>
                      {dep.code} – {dep.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Número de extensión */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Número de extensión</label>
                <input
                  type="text"
                  name="extension_number"
                  value={formData.extension_number}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor ingrese su número de extensión")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Contraseña */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Contraseña</label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor ingrese su contraseña")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Confirmar contraseña */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Confirmar Contraseña</label>
                <input
                  type="password"
                  name="confirm_password"
                  value={formData.confirm_password}
                  onChange={handleChange}
                  required
                  onInvalid={(e) => setRequiredMessage(e, "Por favor confirme su contraseña")}
                  className="w-full border rounded p-2"
                />
              </div>

              {/* Imagen de perfil */}
              <div>
                <label className="block mb-2 font-semibold text-gray-700 tracking-wide">Imagen de perfil (opcional)</label>
                <input
                  type="file"
                  name="profile_picture"
                  accept="image/*"
                  onChange={handleChange}
                  className="w-full border rounded p-2"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-pink-500 hover:from-indigo-700 hover:to-pink-600 text-white font-bold py-3 rounded-3xl shadow-lg transition-transform active:scale-95"
              >
                {loading ? <LoadingSpinner /> : "Registrar"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
