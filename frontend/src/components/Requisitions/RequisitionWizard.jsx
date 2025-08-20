// RequisitionWizard.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import apiClient from '../../api/apiClient';          // <-- ADD THIS
import RequisitionForm from './RequisitionForm';
import RequisitionItems from './RequisitionItems';

export default function RequisitionWizard() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // ----- Step 1 data (unchanged) -----
  const [formData, setFormData] = useState(() => ({
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
    fecha: new Date().toLocaleDateString('es-MX'),
    solicitante: ((user?.first_name || '') + ' ' + (user?.last_name || '')).trim(),
    project_label: '',
    funding_source_label: '',
    budget_unit_label: '',
    agreement_label: '',
    tender_label: '',
    category_label: '',
    external_service_label: '',
  }));

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      department: user?.department || prev.department,
      solicitante:
        ((user?.first_name || '') + ' ' + (user?.last_name || '')).trim() || prev.solicitante,
    }));
  }, [user]);

  const step1FormRef = useRef(null);
  const handleCancel = () => navigate('/requisitions');

  // ====== Step 2 shared state ======
  const [items, setItems] = useState([]);
  const [requisitionNumber, setRequisitionNumber] = useState('');
  const [observaciones, setObservaciones] = useState('');

  // --- Fetch Departments once to resolve requesting_department ID ---
  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get('catalogs/departments/');
        setDepartments(data || []);
      } catch (err) {
        console.error('Error loading departments', err);
      }
    })();
  }, []);

  const findDepartmentId = () => {
    if (!formData.department) return null;
    // Try to match by exact name or if user's department string contains the code+name
    const d = departments.find(
      (d) =>
        d.name === formData.department ||
        formData.department.includes(d.name) ||
        formData.department.includes(d.code)
    );
    return d ? d.id : null;
  };

  const handleResetStep1 = () => {
    setFormData({
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
      fecha: new Date().toLocaleDateString('es-MX'),
      solicitante: ((user?.first_name || '') + ' ' + (user?.last_name || '')).trim(),
      project_label: '',
      funding_source_label: '',
      budget_unit_label: '',
      agreement_label: '',
      tender_label: '',
      category_label: '',
      external_service_label: '',
    });
    setItems([]);
    setRequisitionNumber('');
    setObservaciones('');
  };

  const handleNextFromStep1 = () => {
    const ok = step1FormRef.current?.reportValidity();
    if (!ok) return;
    setStep(2);
  };

  // ====== PUT THE PAYLOAD + POST CALL HERE ======
  const handleFinishFromStep2 = async () => {
    if (!requisitionNumber) {
      showToast('No se pudo asignar número de requisición. Intenta de nuevo.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Agrega al menos una partida antes de continuar.', 'error');
      return;
    }

    // Resolve requesting_department ID
    const deptId = findDepartmentId();
    if (!deptId) {
      showToast('No se pudo determinar el Departamento Solicitante.', 'error');
      return;
    }

    // Build payload as backend expects
    const payload = {
      requesting_department: deptId,
      project: Number(formData.project),
      funding_source: Number(formData.funding_source),
      budget_unit: Number(formData.budget_unit),
      agreement: Number(formData.agreement),
      tender: Number(formData.tender),
      category: Number(formData.category),
      external_service: Number(formData.external_service),
      requisition_reason: formData.description,      // map description -> requisition_reason
      observations: observaciones || null,           // NEW field in DB
      items: items.map(({ product, quantity, unit, description }) => ({
        product: Number(product),
        quantity: Number(quantity),
        unit: Number(unit),
        description: Number(description),            // ItemDescription FK id
      })),
    };

    try {
      await apiClient.post('requisitions/', payload);
      showToast(
        `Requisición #${requisitionNumber} creada correctamente.${observaciones ? ` Observaciones: ${observaciones}` : ''}`,
        'success'
      );
      navigate('/requisitions');
    } catch (err) {
      console.error('Error creando requisición', err);
      // If DRF returns field errors, surface the first one
      const detail =
        err?.response?.data &&
        (typeof err.response.data === 'string'
          ? err.response.data
          : JSON.stringify(err.response.data));
      showToast(`Error al crear requisición${detail ? `: ${detail}` : ''}`, 'error');
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-4">Registro de Requisición</h1>

      {/* STEP 1 */}
      {step === 1 && (
        <>
          <form ref={step1FormRef} onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-4">
              <RequisitionForm embed formData={formData} setFormData={setFormData} />
            </div>
          </form>

          <div className="flex justify-between mt-6 gap-2">
            <button type="button" onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Cancelar</button>
            <button type="button" onClick={handleResetStep1}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded">Borrar</button>
            <button type="button" onClick={handleNextFromStep1}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Siguiente</button>
          </div>
        </>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <>
          <RequisitionItems
            formData={formData}
            items={items}
            setItems={setItems}
            requisitionNumber={requisitionNumber}
            setRequisitionNumber={setRequisitionNumber}
            onCancel={handleCancel}
            onNext={handleFinishFromStep2}    // <--- posts & finishes
          />

          {/* Observaciones textarea at bottom */}
          <div className="mt-6">
            <label className="block mb-2 font-medium">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Escribe observaciones adicionales..."
              className="border p-2 w-full rounded min-h-[100px]"
            />
          </div>

          <div className="flex justify-end mt-6 gap-2">
            <button type="button" onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Cancelar</button>
            <button type="button" onClick={handleFinishFromStep2}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Guardar</button>
          </div>
        </>
      )}
    </div>
  );
}
