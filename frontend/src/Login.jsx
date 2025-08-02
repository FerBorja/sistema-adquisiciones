import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Login() {
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    // Validación simple
    if (!employeeNumber.trim() || !password.trim()) {
      setError('Por favor, completa todos los campos')
      return
    }

    try {
      // Ajusta URL base según dónde tengas corriendo backend
      const response = await axios.post('http://localhost:8000/api/token/', {
        employee_number: employeeNumber,  // o el campo correcto que uses en backend para login
        password: password,
      })

      const { access, refresh } = response.data

      // Guarda tokens en localStorage o sessionStorage
      localStorage.setItem('access_token', access)
      localStorage.setItem('refresh_token', refresh)

      // Redirige a dashboard
      navigate('/dashboard')
    } catch (err) {
      setError('Número de empleado o contraseña incorrectos')
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4">
      <h1 className="text-3xl font-bold mb-6">Sistema de Adquisiciones - Login</h1>
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded shadow-md w-full max-w-sm"
      >
        {error && (
          <div className="mb-4 text-red-600 font-semibold">{error}</div>
        )}

        <label className="block mb-2 font-semibold" htmlFor="employeeNumber">
          Número de empleado
        </label>
        <input
          id="employeeNumber"
          type="text"
          value={employeeNumber}
          onChange={(e) => setEmployeeNumber(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
          placeholder="Ingresa tu número de empleado"
        />

        <label className="block mb-2 font-semibold" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded p-2 mb-6 w-full"
          placeholder="Ingresa tu contraseña"
        />

        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition"
        >
          Iniciar sesión
        </button>

        <button
          type="button"
          onClick={() => navigate('/register')}
          className="mt-4 w-full text-blue-600 hover:underline"
        >
          Registrarse
        </button>
      </form>
    </div>
  )
}