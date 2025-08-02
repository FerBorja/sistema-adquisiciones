import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Register() {
  const [employeeNumber, setEmployeeNumber] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [department, setDepartment] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [email, setEmail] = useState('')
  const [extensionNumber, setExtensionNumber] = useState('')
  const [registrationCode, setRegistrationCode] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (
      !employeeNumber.trim() ||
      !firstName.trim() ||
      !lastName.trim() ||
      !department.trim() ||
      !password.trim() ||
      !confirmPassword.trim() ||
      !email.trim() ||
      !extensionNumber.trim() ||
      !registrationCode.trim()
    ) {
      setError('Por favor, completa todos los campos requeridos')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    try {
      // Ajusta URL a tu backend para registro de usuario
      const response = await axios.post('http://localhost:8000/api/register/', {
        employee_number: employeeNumber,
        first_name: firstName,
        last_name: lastName,
        department: department,
        password: password,
        email: email,
        extension_number: extensionNumber,
        registration_code: registrationCode,
      })

      if (response.status === 201) {
        setSuccess('Registro exitoso. Puedes iniciar sesión ahora.')
        setTimeout(() => navigate('/login'), 2000)
      }
    } catch (err) {
      setError('Error al registrar usuario. Verifica los datos y el código de registro.')
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4">
      <h1 className="text-3xl font-bold mb-6">Registro de Usuario</h1>
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded shadow-md w-full max-w-md"
      >
        {error && <div className="mb-4 text-red-600 font-semibold">{error}</div>}
        {success && <div className="mb-4 text-green-600 font-semibold">{success}</div>}

        <label className="block mb-2 font-semibold" htmlFor="employeeNumber">
          Número de empleado
        </label>
        <input
          id="employeeNumber"
          type="text"
          value={employeeNumber}
          onChange={(e) => setEmployeeNumber(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="firstName">
          Nombre
        </label>
        <input
          id="firstName"
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="lastName">
          Apellido
        </label>
        <input
          id="lastName"
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="department">
          Departamento
        </label>
        <input
          id="department"
          type="text"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
          placeholder="Ejemplo: Ingeniería"
        />

        <label className="block mb-2 font-semibold" htmlFor="email">
          Correo electrónico
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="extensionNumber">
          Número de extensión
        </label>
        <input
          id="extensionNumber"
          type="text"
          value={extensionNumber}
          onChange={(e) => setExtensionNumber(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="registrationCode">
          Código de registro
        </label>
        <input
          id="registrationCode"
          type="text"
          value={registrationCode}
          onChange={(e) => setRegistrationCode(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded p-2 mb-4 w-full"
        />

        <label className="block mb-2 font-semibold" htmlFor="confirmPassword">
          Confirmar contraseña
        </label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="border rounded p-2 mb-6 w-full"
        />

        <button
          type="submit"
          className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 transition"
        >
          Registrarse
        </button>
      </form>
    </div>
  )
}
