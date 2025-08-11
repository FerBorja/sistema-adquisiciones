import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import Navbar from './components/Layout/Navbar';
import Home from './pages/Home';
import About from './pages/About';
import Login from './pages/Login';
import RequisitionDetail from './pages/RequisitionDetail';
import NotFound from './pages/NotFound';
import RequisitionList from './components/Requisitions/RequisitionList';
import RequisitionForm from './components/Requisitions/RequisitionForm';
import PrivateRoute from './routes/PrivateRoute';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/requisitions" element={<PrivateRoute><RequisitionList /></PrivateRoute>} />
          <Route path="/requisitions/new" element={<PrivateRoute><RequisitionForm /></PrivateRoute>} />
          <Route path="/requisitions/:id" element={<PrivateRoute><RequisitionDetail /></PrivateRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
