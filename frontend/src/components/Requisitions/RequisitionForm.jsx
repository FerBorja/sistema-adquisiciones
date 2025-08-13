import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';

export default function RequisitionForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Catalogs for dropdowns
  const [catalogs, setCatalogs] = useState({
    departments: [],
    projects: [],
    categories: [],
  });

  const [formData, setFormData] = useState({
    department: '',
    project: '',
    category: '',
    title: '',
    description: '',
    quantity: 1,
  });

  const [loading, setLoading] = useState(false);

  // Function to set custom required message
  const setRequiredMessage = (e, message) => {
    e.target.setCustomValidity(message);
    e.target.oninput = () => e.target.setCustomValidity('');
  };

  // Fetch catalogs for dropdowns
  useEffect(() => {
    Promise.all([
      apiClient.get('/catalogs/departments/'),
      apiClient.get('/catalogs/projects/'),
      apiClient.get('/catalogs/categories/'),
    ])
      .then(([depRes, projRes, catRes]) => {
        setCatalogs({
          departments: depRes.data,
          projects: projRes.data,
          categories: catRes.data,
        });
      })
      .catch(err => {
        console.error('Error loading catalogs:', err);
        showToast('Error al cargar catálogos.', 'error');
      });
  }, [showToast]);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post('/requisitions/', formData);
      showToast('Requisición creada correctamente!', 'success');

      // Reset form to initial empty state
      setFormData({
        department: '',
        project: '',
        category: '',
        title: '',
        description: '',
        quantity: 1,
      });

      navigate('/requisitions');
    } catch (err) {
      console.error('Error creating requisition:', err);
      showToast('Error al crear requisición.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow space-y-4"
    >
      <h2 className="text-2xl font-semibold mb-4">Crear Requisición</h2>

      {/* Department */}
      <label className="block mb-1 font-medium">Departamento</label>
      <select
        name="department"
        value={formData.department}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione un departamento')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Departamento</option>
        {catalogs.departments.map(dep => (
          <option key={dep.id} value={dep.id}>{dep.name}</option>
        ))}
      </select>

      {/* Project */}
      <label className="block mb-1 font-medium">Proyecto</label>
      <select
        name="project"
        value={formData.project}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione un proyecto')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Proyecto</option>
        {catalogs.projects.map(proj => (
          <option key={proj.id} value={proj.id}>{proj.name}</option>
        ))}
      </select>

      {/* Category */}
      <label className="block mb-1 font-medium">Categoría</label>
      <select
        name="category"
        value={formData.category}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una categoría')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Categoría</option>
        {catalogs.categories.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>

      {/* Title */}
      <label className="block mb-1 font-medium">Título</label>
      <input
        type="text"
        name="title"
        value={formData.title}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor ingrese el título')}
        className="border p-2 w-full rounded"
      />

      {/* Description */}
      <label className="block mb-1 font-medium">Descripción</label>
      <textarea
        name="description"
        value={formData.description}
        onChange={handleChange}
        className="border p-2 w-full rounded"
      />

      {/* Quantity */}
      <label className="block mb-1 font-medium">Cantidad</label>
      <input
        type="number"
        name="quantity"
        value={formData.quantity}
        onChange={handleChange}
        min="1"
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor ingrese la cantidad')}
        className="border p-2 w-full rounded"
      />

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full disabled:opacity-50"
      >
        {loading ? <LoadingSpinner /> : 'Enviar'}
      </button>
    </form>
  );
}
