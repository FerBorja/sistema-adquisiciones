import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';
import { AuthContext } from '../../contexts/AuthContext';

export default function RequisitionForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useContext(AuthContext);

  // Catalogs for dropdowns
  const [catalogs, setCatalogs] = useState({
    projects: [],
    categories: [],
    funding_sources: [],
    budget_units: [],
    agreements: [],
    tenders: [],
  });

  const [formData, setFormData] = useState({
    department: user?.department || '',
    project: '',
    funding_source: '',
    budget_unit: '',
    agreement: '',
    tender: '',
    category: '',
    title: '',
    description: '',
    quantity: 1,
  });

  const [loading, setLoading] = useState(false);

  // Prefill department from current user
  useEffect(() => {
    if (user?.department) {
      setFormData(prev => ({
        ...prev,
        department: user.department,
      }));
    }
  }, [user]);

  // Function to set custom required message
  const setRequiredMessage = (e, message) => {
    e.target.setCustomValidity(message);
    e.target.oninput = () => e.target.setCustomValidity('');
  };

  // Fetch catalogs for dropdowns
  useEffect(() => {
    Promise.all([
      apiClient.get('/catalogs/projects/'),
      apiClient.get('/catalogs/categories/'),
      apiClient.get('/catalogs/funding-sources/'),
      apiClient.get('/catalogs/budget-units/'),
      apiClient.get('/catalogs/agreements/'),
      apiClient.get('/catalogs/tenders/'),
    ])
      .then(([projRes, catRes, fundRes, buRes, agreeRes, tenderRes]) => {
        setCatalogs({
          projects: projRes.data || [],
          categories: catRes.data || [],
          funding_sources: fundRes.data || [],
          budget_units: buRes.data || [],
          agreements: agreeRes.data || [],
          tenders: tenderRes.data || [],
        });
      })
      .catch(err => {
        console.error('Error loading catálogos:', err);
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

      setFormData(prev => ({
        ...prev,
        project: '',
        funding_source: '',
        budget_unit: '',
        agreement: '',
        tender: '',
        category: '',
        title: '',
        description: '',
        quantity: 1,
      }));

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
        disabled
        className="border p-2 w-full rounded bg-gray-100"
      >
        <option value={formData.department || ''}>
          {formData.department || 'No asignado'}
        </option>
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
          <option key={proj.id} value={proj.id}>
            {proj.description}
          </option>
        ))}
      </select>

      {/* Funding Source */}
      <label className="block mb-1 font-medium">Fuente de Financiamiento</label>
      <select
        name="funding_source"
        value={formData.funding_source}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una fuente de financiamiento')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Fuente de Financiamiento</option>
        {catalogs.funding_sources.map(fs => (
          <option key={fs.id} value={fs.id}>
            {fs.code} - {fs.description}
          </option>
        ))}
      </select>

      {/* Budget Unit */}
      <label className="block mb-1 font-medium">Unidad Presupuestal</label>
      <select
        name="budget_unit"
        value={formData.budget_unit}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una unidad presupuestal')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Unidad Presupuestal</option>
        {catalogs.budget_units.map(bu => (
          <option key={bu.id} value={bu.id}>
            {bu.code} - {bu.description}
          </option>
        ))}
      </select>

      {/* Agreements */}
      <label className="block mb-1 font-medium">Convenios</label>
      <select
        name="agreement"
        value={formData.agreement}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione un convenio')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Convenio</option>
        {catalogs.agreements.map(a => (
          <option key={a.id} value={a.id}>
            {a.code} - {a.description}
          </option>
        ))}
      </select>

      {/* Tender */}
      <label className="block mb-1 font-medium">Licitación</label>
      <select
        name="tender"
        value={formData.tender}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una licitación')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Licitación</option>
        {catalogs.tenders.map(t => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
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
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
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
