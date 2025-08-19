import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import RequisitionForm from './RequisitionForm';
import RequisitionItems from './RequisitionItems';

export default function RequisitionWizard() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // ----- Step 1 data (controlled form) -----
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

  // HTML5 validation for step 1
  const step1FormRef = useRef(null);
  const handleCancel = () => navigate('/requisitions');

  // ====== Lifted state for Step 2 & Step 3 ======
  const [items, setItems] = useState([]);               // filled in Step 2, used in Step 3
  const [requisitionNumber, setRequisitionNumber] = useState(''); // generated in Step 2, used in Step 3

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
    // clear items & temp number
    setItems([]);
    setRequisitionNumber('');
  };

  const handleNextFromStep1 = () => {
    const ok = step1FormRef.current?.reportValidity();
    if (!ok) return;
    setStep(2);
  };

  const handleNextFromStep2 = () => {
    if (!requisitionNumber) {
      showToast('No se pudo asignar número de requisición. Intenta de nuevo.', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('Agrega al menos una partida antes de continuar.', 'error');
      return;
    }
    setStep(3);
  };

  // ----- Step 3 Save -----
  const handleSave = () => {
    const payload = {
      // backend fields
      department: formData.department,
      project: formData.project,
      funding_source: formData.funding_source,
      budget_unit: formData.budget_unit,
      agreement: formData.agreement,
      tender: formData.tender,
      category: formData.category,
      title: formData.title,
      description: formData.description,
      external_service: formData.external_service,
      // items mapped to DB keys
      items: items.map(({ product, quantity, unit, description }) => ({
        product,
        quantity,
        unit,
        description, // FK id for ItemDescription
      })),
      // client-only meta
      meta: {
        requisition_number: requisitionNumber,
        fecha: formData.fecha,
        solicitante: formData.solicitante,
        labels: {
          project: formData.project_label,
          funding_source: formData.funding_source_label,
          budget_unit: formData.budget_unit_label,
          agreement: formData.agreement_label,
          tender: formData.tender_label,
          category: formData.category_label,
          external_service: formData.external_service_label,
        },
      },
    };
    console.log('Payload listo para enviar:', payload);
    alert(`Datos listos para guardar (Requisición No. ${requisitionNumber}). Revisa la consola.`);
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
        <RequisitionItems
          formData={formData}                 // for "Resumen del Paso 1"
          items={items}
          setItems={setItems}
          requisitionNumber={requisitionNumber}
          setRequisitionNumber={setRequisitionNumber}
          onCancel={handleCancel}
          onNext={handleNextFromStep2}
        />
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <>
          <p className="text-gray-600">Paso 3 (aún vacío)</p>
          <div className="flex justify-between mt-6 gap-2">
            <button type="button" onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Cancelar</button>
            <button type="button" onClick={handleSave}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded">Guardar</button>
          </div>
        </>
      )}
    </div>
  );
}
