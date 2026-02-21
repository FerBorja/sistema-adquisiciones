// frontend/src/components/Requisitions/RequisitionForm.jsx
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';
import { AuthContext } from '../../contexts/AuthContext';

/**
 * Props:
 * - mode: "create" | "edit" (default: "create")
 * - initialData: requisition object from GET /requisitions/:id/ (required for edit)
 * - embed: boolean (kept from your original)
 * - formData, setFormData: (optional) "controlled-if-provided" pattern
 * - ackCostRealistic: (optional) boolean. If provided, will be sent as ack_cost_realistic.
 */
export default function RequisitionForm({
  mode = 'create',
  initialData = null,
  embed = false,
  formData,
  setFormData,
  ackCostRealistic, // optional
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useContext(AuthContext);

  const fetchedCatalogs = useRef(false);

  const [catalogs, setCatalogs] = useState({
    projects: [],
    funding_sources: [],
    budget_units: [],
    agreements: [],
    tenders: [],
    external_services: [],
  });

  // Controlled-if-provided pattern
  const [internalFormData, setInternalFormData] = useState(() => ({
    department: user?.department || '',
    project: '',
    funding_source: '',
    budget_unit: '',
    agreement: '',
    tender: '',
    title: '',
    description: '',
    external_service: '',
    fecha: new Date().toLocaleDateString('es-MX'),
    solicitante: ((user?.first_name || '') + ' ' + (user?.last_name || '')).trim(),
    // labels for Step 2 / summaries
    project_label: '',
    funding_source_label: '',
    budget_unit_label: '',
    agreement_label: '',
    tender_label: '',
    external_service_label: '',
  }));

  const isControlled = Boolean(formData && setFormData);
  const data = isControlled ? formData : internalFormData;
  const update = isControlled ? setFormData : setInternalFormData;

  const [loading, setLoading] = useState(false);

  // Redirect if no token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast?.('Tu sesión ha expirado. Por favor inicia sesión de nuevo.', 'warning');
      navigate('/login');
    }
  }, [navigate, showToast]);

  // Keep department/solicitante updated if user changes
  useEffect(() => {
    if (user?.department || user?.first_name || user?.last_name) {
      update((prev) => ({
        ...prev,
        department: user?.department || prev.department,
        solicitante: ((user?.first_name || '') + ' ' + (user?.last_name || '')).trim() || prev.solicitante,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const setRequiredMessage = (e, message) => {
    e.target.setCustomValidity(message);
    e.target.oninput = () => e.target.setCustomValidity('');
  };

  // Fetch catalogs once
  useEffect(() => {
    if (fetchedCatalogs.current) return;
    fetchedCatalogs.current = true;

    (async () => {
      try {
        const [
          projRes,
          fundRes,
          buRes,
          agreeRes,
          tenderRes,
          extRes,
        ] = await Promise.all([
          apiClient.get('/catalogs/projects/'),
          apiClient.get('/catalogs/funding-sources/'),
          apiClient.get('/catalogs/budget-units/'),
          apiClient.get('/catalogs/agreements/'),
          apiClient.get('/catalogs/tenders/'),
          apiClient.get('/catalogs/external-services/'),
        ]);

        setCatalogs({
          projects: projRes.data || [],
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
  }, []); // only once

  // Helper: set both value + label when you know an ID and you have catalogs
  const setValueAndLabel = (valueKey, labelKey, id, list, labelBuilder) => {
    const found = (list || []).find((x) => String(x.id) === String(id));
    const label = found ? labelBuilder(found) : '';
    update((prev) => ({ ...prev, [valueKey]: id || '', [labelKey]: label }));
  };

  // When editing: hydrate the form with initialData (values + labels)
  useEffect(() => {
    if (mode !== 'edit' || !initialData) return;

    // Base fields first (safe fallbacks)
    update((prev) => ({
      ...prev,
      // UI textarea maps to backend requisition_reason
      description: initialData.requisition_reason ?? initialData.description ?? prev.description,
      fecha: prev.fecha, // keep UI date read-only
      title: prev.title, // (not used by backend, kept for UI compatibility)
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialData]);

  // Once catalogs are available, set IDs + labels from initialData
  useEffect(() => {
    if (mode !== 'edit' || !initialData) return;

    const {
      project,
      funding_source,
      budget_unit,
      agreement,
      tender,
      external_service,
    } = initialData;

    // Support both nested objects and raw ids from API
    const getId = (objOrId) => (objOrId && typeof objOrId === 'object' ? objOrId.id : objOrId);

    setValueAndLabel('project', 'project_label', getId(project), catalogs.projects, (p) => p.description);
    setValueAndLabel(
      'funding_source',
      'funding_source_label',
      getId(funding_source),
      catalogs.funding_sources,
      (fs) => `${fs.code} - ${fs.description}`
    );
    setValueAndLabel(
      'budget_unit',
      'budget_unit_label',
      getId(budget_unit),
      catalogs.budget_units,
      (bu) => `${bu.code} - ${bu.description}`
    );
    setValueAndLabel(
      'agreement',
      'agreement_label',
      getId(agreement),
      catalogs.agreements,
      (a) => `${a.code} - ${a.description}`
    );
    setValueAndLabel('tender', 'tender_label', getId(tender), catalogs.tenders, (t) => t.name);
    setValueAndLabel(
      'external_service',
      'external_service_label',
      getId(external_service),
      catalogs.external_services,
      (s) => s.name
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialData, catalogs]);

  const handleChange = (e) => {
    update((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // For selects, also store the display label so Step 2 can show names
  const handleSelectChange = (e, valueKey, labelKey) => {
    const val = e.target.value;
    const label = e.target.options[e.target.selectedIndex]?.text || '';
    update((prev) => ({ ...prev, [valueKey]: val, [labelKey]: label }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const basePayload = {
        project: data.project || null,
        funding_source: data.funding_source || null,
        budget_unit: data.budget_unit || null,
        agreement: data.agreement || null,
        tender: data.tender || null,
        external_service: data.external_service || null,
        requisition_reason: data.description || '',
        ...(typeof ackCostRealistic === 'boolean' ? { ack_cost_realistic: ackCostRealistic } : {}),
      };

      if (mode === 'edit' && initialData?.id) {
        // Preserve the original requesting_department when editing
        const rd = initialData.requesting_department;
        const requesting_department =
          (rd && typeof rd === 'object' ? rd.id : rd) ?? undefined;

        await apiClient.put(
          `/requisitions/${initialData.id}/`,
          {
            ...basePayload,
            ...(requesting_department ? { requesting_department } : {}),
          }
        );
        showToast?.('Requisición actualizada correctamente!', 'success');
      } else {
        await apiClient.post('/requisitions/', basePayload);
        showToast?.('Requisición creada correctamente!', 'success');
      }

      navigate('/requisitions');
    } catch (err) {
      console.error('Error guardando la requisición:', err);
      showToast?.('Error al guardar la requisición.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <>
      <label className="block mb-1 font-medium">Departamento</label>
      <input
        type="text"
        name="department"
        value={data.department}
        readOnly
        required
        onInvalid={(e) => setRequiredMessage(e, 'El departamento es obligatorio')}
        className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
      />

      <label className="block mb-1 font-medium">Proyecto</label>
      <select
        name="project"
        value={data.project}
        onChange={(e) => handleSelectChange(e, 'project', 'project_label')}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione un proyecto')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Proyecto</option>
        {catalogs.projects.map((proj) => (
          <option key={proj.id} value={proj.id}>
            {proj.description}
          </option>
        ))}
      </select>

      <label className="block mb-1 font-medium">Fuente de Financiamiento</label>
      <select
        name="funding_source"
        value={data.funding_source}
        onChange={(e) => handleSelectChange(e, 'funding_source', 'funding_source_label')}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una fuente de financiamiento')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Fuente de Financiamiento</option>
        {catalogs.funding_sources.map((fs) => (
          <option key={fs.id} value={fs.id}>
            {fs.code} - {fs.description}
          </option>
        ))}
      </select>

      <label className="block mb-1 font-medium">Unidad Presupuestal</label>
      <select
        name="budget_unit"
        value={data.budget_unit}
        onChange={(e) => handleSelectChange(e, 'budget_unit', 'budget_unit_label')}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una unidad presupuestal')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Unidad Presupuestal</option>
        {catalogs.budget_units.map((bu) => (
          <option key={bu.id} value={bu.id}>
            {bu.code} - {bu.description}
          </option>
        ))}
      </select>

      <label className="block mb-1 font-medium">Convenios</label>
      <select
        name="agreement"
        value={data.agreement}
        onChange={(e) => handleSelectChange(e, 'agreement', 'agreement_label')}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione un convenio')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Convenio</option>
        {catalogs.agreements.map((a) => (
          <option key={a.id} value={a.id}>
            {a.code} - {a.description}
          </option>
        ))}
      </select>

      <label className="block mb-1 font-medium">Licitación</label>
      <select
        name="tender"
        value={data.tender}
        onChange={(e) => handleSelectChange(e, 'tender', 'tender_label')}
        required
        onInvalid={(e) => setRequiredMessage(e, 'Por favor seleccione una licitación')}
        className="border p-2 w-full rounded"
      >
        <option value="">Seleccione Licitación</option>
        {catalogs.tenders.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <label className="block mb-1 font-medium">Fecha</label>
      <input
        type="text"
        name="fecha"
        value={data.fecha}
        readOnly
        required
        onInvalid={(e) => setRequiredMessage(e, 'La fecha es obligatoria')}
        className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
      />

      <label className="block mb-1 font-medium">Motivos Requisición</label>
      <textarea
        name="description"
        value={data.description}
        onChange={handleChange}
        required
        onInvalid={(e) => setRequiredMessage(e, 'La descripción es obligatoria')}
        className="border p-2 w-full rounded"
      />

      <label className="block mb-1 font-medium">Solicitante</label>
      <input
        type="text"
        name="solicitante"
        value={data.solicitante}
        readOnly
        required
        onInvalid={(e) => setRequiredMessage(e, 'El solicitante es obligatorio')}
        className="border p-2 w-full rounded bg-gray-100 cursor-not-allowed"
      />

      <label className="block mb-1 font-medium">Servicio Externo / Académico</label>
      <select
        name="external_service"
        value={data.external_service}
        onChange={(e) => handleSelectChange(e, 'external_service', 'external_service_label')}
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
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow space-y-4">
      <h2 className="text-2xl font-semibold mb-4">
        {mode === 'edit' ? 'Editar Requisición' : 'Crear Requisición'}
      </h2>
      {content}
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded w-full disabled:opacity-50"
      >
        {loading ? <LoadingSpinner /> : (mode === 'edit' ? 'Guardar Cambios' : 'Enviar')}
      </button>
    </form>
  );
}