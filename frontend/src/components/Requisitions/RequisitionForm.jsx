import React, { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';
import { AuthContext } from '../../contexts/AuthContext';

export default function RequisitionForm({ embed = false }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useContext(AuthContext);

  const fetchedCatalogs = useRef(false);

  const [catalogs, setCatalogs] = useState({
    projects: [],
    categories: [],
    funding_sources: [],
    budget_units: [],
    agreements: [],
    tenders: [],
    external_services: [],
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
    external_service: '',
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast?.('Tu sesión ha expirado. Por favor inicia sesión de nuevo.', 'warning');
      navigate('/login');
    }
  }, [navigate, showToast]);

  useEffect(() => {
    if (user?.department) {
      setFormData(prev => ({
        ...prev,
        department: user.department,
      }));
    }
  }, [user]);

  const setRequiredMessage = (e, message) => {
    e.target.setCustomValidity(message);
    e.target.oninput = () => e.target.setCustomValidity('');
  };

  useEffect(() => {
    if (fetchedCatalogs.current) return;
    fetchedCatalogs.current = true;

    (async () => {
      try {
        const [
          projRes,
          catRes,
          fundRes,
          buRes,
          agreeRes,
          tenderRes,
          extRes,
        ] = await Promise.all([
          apiClient.get('/catalogs/projects/'),
          apiClient.get('/catalogs/categories/'),
          apiClient.get('/catalogs/funding-sources/'),
          apiClient.get('/catalogs/budget-units/'),
          apiClient.get('/catalogs/agreements/'),
          apiClient.get('/catalogs/tenders/'),
          apiClient.get('/catalogs/external-services/'),
        ]);

        setCatalogs({
          projects: projRes.data || [],
          categories: catRes.data || [],
          funding_sources: fundRes.data || [],
          budget_units: buRes.data || [],
          agreements: agreeRes.data || [],
          tenders: tenderRes.data || [],
          external_services: extRes.data || [],
        });
      } catch (err) {
        console.error('Error loading catálogos:', err);
        showToast?.('Error al cargar catálogos.', 'error');
      }
    })();
  }, []);

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
      showToast?.('Requisición creada correctamente!', 'success');
      navigate('/requisitions');
    } catch (err) {
      console.error('Error creating requisition:', err);
      showToast?.('Error al crear requisición.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <>
      {/* Department */}
      <label className="block mb-1 font-medium">Departamento</label>
      <input
        type="text"
        name="department"
        value={formData.department}
        readOnly
        required
        onInvalid={(e) => setRequiredMessage(e, 'El departamento es obligatorio')}
        className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
      />

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

      {/* Fecha */}
      <label className="block mb-1 font-medium">Fecha</label>
      <input
        type="text"
        name="fecha"
        value={new Date().toLocaleDateString('es-MX')}
        readOnly
        required
        onInvalid={(e) => setRequiredMessage(e, 'La fecha es obligatoria')}
        className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
      />

      {/* Description */}
      <label className="block mb-1 font-medium">Motivos Requisición</label>
      <textarea
        name="description"
        value={formData.description}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'La descripción es obligatoria')}
        className="border p-2 w-full rounded"
      />

      {/* Solicitante */}
      <label className="block mb-1 font-medium">Solicitante</label>
      <input
        type="text"
        name="solicitante"
        value={(user?.first_name || '') + ' ' + (user?.last_name || '')}
        readOnly
        required
        onInvalid={(e) => setRequiredMessage(e, 'El solicitante es obligatorio')}
        className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
      />

      {/* Servicio Externo / Académico */}
      <label className="block mb-1 font-medium">Servicio Externo / Académico</label>
      <select
        name="external_service"
        value={formData.external_service}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione un servicio')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Servicio</option>
        {catalogs.external_services.map((svc) => (
          <option key={svc.id} value={svc.id}>
            {svc.name}
          </option>
        ))}
      </select>
    </>
  );

  if (embed) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow space-y-4"
    >
      <h2 className="text-2xl font-semibold mb-4">Crear Requisición</h2>
      {content}
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
