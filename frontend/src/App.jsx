import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './Login'
import Register from './Register.jsx'
import Dashboard from './Dashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {/* Add a default route */}
        <Route path="*" element={<Login />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
