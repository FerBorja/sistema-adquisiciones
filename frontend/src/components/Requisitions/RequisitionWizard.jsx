// src/components/Requisitions/RequisitionWizard.jsx
import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import RequisitionForm from './RequisitionForm';

export default function RequisitionWizard() {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  // This form wraps ONLY step 1 to leverage native HTML5 validation
  const step1FormRef = useRef(null);

  const handleCancel = () => navigate('/requisitions');

  const handleNextFromStep1 = () => {
    if (!step1FormRef.current) return;
    // Trigger native validation UI; returns true if valid
    const ok = step1FormRef.current.reportValidity();
    if (!ok) return;
    setStep(2);
  };

  const handleNextFromStep2 = () => setStep(3);

  const handleResetStep1 = () => {
    // resets all fields in step 1 form (including selects/inputs)
    step1FormRef.current?.reset();
    // optional: also reload to reset any React state if needed
    // window.location.reload();
  };

  const handleSave = () => {
    // placeholder for step 3 save logic
    alert('Guardar requisición');
  };

  return (
    <div className="max-w-2xl mx-auto bg-white p-6 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-4">Registro de Requisición</h1>

      {step === 1 && (
        <>
          {/* Wrap step 1 fields in a real <form> so reportValidity() works */}
          <form ref={step1FormRef} onSubmit={(e) => e.preventDefault()}>
            <div className="space-y-4">
              <RequisitionForm embed />
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

      {step === 2 && (
        <>
          <p className="text-gray-600">Paso 2 (aún vacío)</p>
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
              onClick={handleNextFromStep2}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
            >
              Siguiente
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <p className="text-gray-600">Paso 3 (aún vacío)</p>
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
              onClick={handleSave}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
            >
              Guardar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
