// frontend/src/components/Requisitions/RequisitionWizard.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import apiClient from '../../api/apiClient';
import RequisitionForm from './RequisitionForm';
import RequisitionItems from './RequisitionItems';

export default function RequisitionWizard() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // ----- Step 1 data -----
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
    // Display-only
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
  const [saving, setSaving] = useState(false);

  // --- Fetch Departments to resolve requesting_department ID ---
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
    const d = departments.find(
      (d) =>
        d.name === formData.department ||
        formData.department.includes(d.name) ||
        formData.department.includes?.(d.code)
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

  // ===== Helpers =====
  const idOrUndef = (v) =>
    v === '' || v === null || typeof v === 'undefined' ? undefined : Number(v);

  const strOrUndef = (v) => {
    const s = (v ?? '').toString().trim();
    return s.length ? s : undefined;
  };

  const compact = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v !== 'undefined'));

  // Convierte "$ 1,234.50" / "1234.50" / "1,234.50" -> Number
  const parseMoney = (v) => {
    if (v === null || typeof v === 'undefined') return NaN;
    if (typeof v === 'number') return v;
    const s = String(v).trim();
    if (!s) return NaN;
    // quita $ y espacios, quita comas de miles
    const cleaned = s.replace(/\$/g, '').replace(/\s+/g, '').replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  };

  // ====== Guardar (create Requisition) from Step 2 ======
  const handleFinishFromStep2 = async () => {
    if (saving) return;

    // quick front-end guards
    if (!requisitionNumber) {
      showToast('No se pudo asignar número de requisición. Intenta de nuevo.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Agrega al menos una partida antes de continuar.', 'error');
      return;
    }

    // resolve department FK
    const deptId = findDepartmentId();
    if (!deptId) {
      showToast('No se pudo determinar el Departamento Solicitante.', 'error');
      return;
    }

    // ✅ Validación de estimated_total por renglón (obligatorio y > 0)
    // También soporta que puedas traer estimated_unit_cost y calcular el total si quieres.
    const invalidLines = [];
    const normalizedItems = items.map((it, idx) => {
      const product = Number(it.product);
      const quantity = Number(it.quantity);
      const unit = Number(it.unit);
      const description = Number(it.description);

      // A) esperado: viene capturado en UI
      let estimatedTotal = parseMoney(it.estimated_total);

      // B) opcional: si no viene total pero viene unitario, calcula
      if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0) {
        const unitCost = parseMoney(it.estimated_unit_cost);
        if (Number.isFinite(unitCost) && unitCost > 0 && Number.isFinite(quantity) && quantity > 0) {
          estimatedTotal = Number((unitCost * quantity).toFixed(2));
        }
      }

      if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0) {
        invalidLines.push(idx + 1); // renglón humano (1-based)
      }

      const payloadItem = {
        product,
        quantity,
        unit,
        description,
        // ✅ NUEVO: obligatorio
        estimated_total: estimatedTotal,
      };

      // opcional (si lo traes): guardar unitario también
      const unitCost = parseMoney(it.estimated_unit_cost);
      if (Number.isFinite(unitCost) && unitCost > 0) {
        payloadItem.estimated_unit_cost = Number(unitCost.toFixed(2));
      }

      return payloadItem;
    });

    if (invalidLines.length) {
      showToast(
        `Falta "Monto estimado" válido (> 0) en los renglones: ${invalidLines.join(', ')}`,
        'error'
      );
      return;
    }

    // build payload – omit empty/undefined fields
    const base = {
      requesting_department: deptId, // required
      project: idOrUndef(formData.project),
      funding_source: idOrUndef(formData.funding_source),
      budget_unit: idOrUndef(formData.budget_unit),
      agreement: idOrUndef(formData.agreement),
      tender: idOrUndef(formData.tender),
      category: idOrUndef(formData.category),
      external_service: idOrUndef(formData.external_service),
      requisition_reason: strOrUndef(formData.description),
      observations: strOrUndef(observaciones),
      items: normalizedItems,
    };

    const payload = compact(base);

    try {
      setSaving(true);
      await apiClient.post('requisitions/', payload);
      showToast(
        `Requisición #${requisitionNumber} creada correctamente.${
          payload.observations ? ` Observaciones: ${payload.observations}` : ''
        }`,
        'success'
      );
      navigate('/requisitions');
    } catch (err) {
      console.error('Error creando requisición', err);

      const raw = err?.response?.data;
      let detail = '';
      if (typeof raw === 'string') {
        detail = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 500);
      } else if (raw && typeof raw === 'object') {
        detail = JSON.stringify(raw);
      }

      showToast(`Error al crear requisición${detail ? `: ${detail}` : ''}`, 'error');

      console.warn(
        'If you recently added the "observations" field, make sure migrations ran and the serializer exposes it.'
      );
    } finally {
      setSaving(false);
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
            <button
              type="button"
              onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleResetStep1}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={handleNextFromStep1}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Siguiente
            </button>
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
          />

          {/* Observaciones textarea */}
          <div className="mt-6">
            <label className="block mb-2 font-medium">Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Escribe observaciones adicionales..."
              className="border p-2 w-full rounded min-h-[100px]"
            />
          </div>

          {/* Bottom buttons */}
          <div className="flex justify-end mt-6 gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleFinishFromStep2}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60"
              disabled={saving}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
