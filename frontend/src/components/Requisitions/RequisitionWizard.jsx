// frontend/src/components/Requisitions/RequisitionWizard.jsx
import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import apiClient from '../../api/apiClient';
import RequisitionForm from './RequisitionForm';

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
      solicitante: ((user?.first_name || '') + ' ' + (user?.last_name || '')).trim() || prev.solicitante,
    }));
  }, [user]);

  // HTML5 validation for step 1
  const step1FormRef = useRef(null);
  const handleCancel = () => navigate('/requisitions');

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
    // also clear items & temp number
    setItems([]);
    setRequisitionNumber('');
    tempNumberFetched.current = false;
  };

  const handleNextFromStep1 = () => {
    const ok = step1FormRef.current?.reportValidity();
    if (!ok) return;
    setStep(2);
  };

  // ============================
  // STEP 2: Registro de Partidas
  // ============================
  // Catalogs: Products (Objeto del Gasto) & Units (Unidad de Medida)
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const catalogsFetched = useRef(false);

  useEffect(() => {
    const labelOf = (obj) => {
      const code = obj.code || obj.clave || obj.codigo;
      const name = obj.name || obj.nombre || obj.description || obj.descripcion;
      return code ? `${code} - ${name ?? ''}`.trim() : (name ?? String(obj.id));
    };

    const tryGet = async (urls) => {
      for (const url of urls) {
        try {
          const res = await apiClient.get(url);
          const arr = Array.isArray(res.data) ? res.data : (res.data?.results || []);
          if (arr.length) return arr;
        } catch {
          // try next
        }
      }
      return [];
    };

    const fetchCatalogs = async () => {
      // Products
      const prodArr = await tryGet([
        '/catalogs/products/',
        '/products/',
        '/catalogs/items/',
        '/catalogs/expense-objects/', // last resort if your "product" is stored as expense-objects
      ]);
      setProducts(prodArr.map(p => ({ id: p.id, label: labelOf(p) })));

      // Units
      const unitArr = await tryGet([
        '/catalogs/units/',
        '/catalogs/measurement-units/',
        '/catalogs/uoms/',
        '/units/',
      ]);
      setUnits(unitArr.map(u => ({ id: u.id, label: labelOf(u) })));
    };

    if (step === 2 && !catalogsFetched.current) {
      catalogsFetched.current = true;
      fetchCatalogs();
    }
  }, [step]);

  // Items state
  const [items, setItems] = useState([]);
  const [newItem, setNewItem] = useState({
    product: '',           // id
    product_label: '',     // display
    quantity: '',
    unit: '',              // id
    unit_label: '',        // display
    description: '',
  });

  const addItem = () => {
    const qty = Number(newItem.quantity);

    if (!newItem.product) return showToast('Selecciona el Objeto del Gasto (Producto).', 'error');
    if (!Number.isFinite(qty) || qty <= 0) return showToast('La cantidad debe ser mayor que 0.', 'error');
    if (!newItem.unit) return showToast('Selecciona la Unidad de Medida.', 'error');
    if (!newItem.description.trim()) return showToast('La descripción es obligatoria.', 'error');

    const partida = {
      id: Date.now(),
      product: newItem.product,
      product_label: newItem.product_label,
      quantity: qty,
      unit: newItem.unit,
      unit_label: newItem.unit_label,
      description: newItem.description.trim(),
    };
    setItems((prev) => [...prev, partida]);
    setNewItem({ product: '', product_label: '', quantity: '', unit: '', unit_label: '', description: '' });
  };

  const removeItem = (id) => setItems((prev) => prev.filter((p) => p.id !== id));

  // Auto temporary requisition number
  const [requisitionNumber, setRequisitionNumber] = useState('');
  const tempNumberFetched = useRef(false);

  const extractLastNumber = (payload) => {
    const arr = Array.isArray(payload) ? payload : (Array.isArray(payload?.results) ? payload.results : []);
    const first = arr[0] || null;
    if (!first) return null;
    const raw = first.number ?? first.folio ?? first.consecutive ?? first.no ?? first.n ?? first.id ?? null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  useEffect(() => {
    const fetchTempNumber = async () => {
      try {
        const urls = [
          '/requisitions/?ordering=-number&limit=1',
          '/requisitions/?ordering=-number&page_size=1',
          '/requisitions/?ordering=-id&limit=1',
          '/requisitions/?ordering=-id&page_size=1',
        ];
        let last = null;
        for (const url of urls) {
          try {
            const res = await apiClient.get(url);
            const candidate = extractLastNumber(res.data);
            if (candidate !== null) {
              last = candidate;
              break;
            }
          } catch {/* try next */}
        }
        const next = (last ?? 0) + 1;
        setRequisitionNumber(String(next));
      } catch (err) {
        console.error('No se pudo obtener el último número de requisición:', err);
        setRequisitionNumber('1');
      }
    };

    if (step === 2 && !tempNumberFetched.current) {
      tempNumberFetched.current = true;
      fetchTempNumber();
    }
  }, [step]);

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

  // ----- Step 3 Save (placeholder) -----
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
      items: items.map(({ id, product, quantity, unit, description }) => ({
        product,
        quantity,
        unit,
        description,
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
        <>
          <div className="flex flex-wrap items-center gap-2 mt-2 mb-4">
            <h2 className="text-xl font-semibold">
              Requisicion No. {requisitionNumber || '...'} Información de registro
            </h2>
          </div>

          <h3 className="text-lg font-semibold mb-3">Resumen del Paso 1</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            <div><div className="text-sm text-gray-500">Departamento</div><div className="font-medium">{formData.department}</div></div>
            <div><div className="text-sm text-gray-500">Proyecto</div><div className="font-medium">{formData.project_label || formData.project}</div></div>
            <div><div className="text-sm text-gray-500">Fuente de Financiamiento</div><div className="font-medium">{formData.funding_source_label || formData.funding_source}</div></div>
            <div><div className="text-sm text-gray-500">Unidad Presupuestal</div><div className="font-medium">{formData.budget_unit_label || formData.budget_unit}</div></div>
            <div><div className="text-sm text-gray-500">Convenio</div><div className="font-medium">{formData.agreement_label || formData.agreement}</div></div>
            <div><div className="text-sm text-gray-500">Licitación</div><div className="font-medium">{formData.tender_label || formData.tender}</div></div>
            <div><div className="text-sm text-gray-500">Categoría</div><div className="font-medium">{formData.category_label || formData.category}</div></div>
            <div><div className="text-sm text-gray-500">Fecha</div><div className="font-medium">{formData.fecha}</div></div>
            <div className="md:col-span-2"><div className="text-sm text-gray-500">Motivos Requisición</div><div className="font-medium">{formData.description}</div></div>
            <div><div className="text-sm text-gray-500">Solicitante</div><div className="font-medium">{formData.solicitante}</div></div>
            <div><div className="text-sm text-gray-500">Servicio Externo / Académico</div><div className="font-medium">{formData.external_service_label || formData.external_service}</div></div>
          </div>

          <h3 className="text-lg font-semibold mb-2">Registro de Partidas</h3>

          {/* New item form — exact order required */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end mb-3">
            {/* 1) Objeto del Gasto (Product) */}
            <div className="md:col-span-4">
              <label className="block mb-1 font-medium">Objeto del Gasto</label>
              <select
                value={newItem.product}
                onChange={(e) => {
                  const id = e.target.value;
                  const label = e.target.options[e.target.selectedIndex]?.text || '';
                  setNewItem((p) => ({ ...p, product: id, product_label: label }));
                }}
                className="border p-2 w-full rounded"
              >
                <option value="">Seleccione Objeto del Gasto</option>
                {products.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* 2) Cantidad (Quantity) */}
            <div className="md:col-span-2">
              <label className="block mb-1 font-medium">Cantidad</label>
              <input
                type="number"
                min="0"
                step="1"
                value={newItem.quantity}
                onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))}
                className="border p-2 w-full rounded"
              />
            </div>

            {/* 3) Unidad de Medida (Unit) */}
            <div className="md:col-span-3">
              <label className="block mb-1 font-medium">Unidad de Medida</label>
              <select
                value={newItem.unit}
                onChange={(e) => {
                  const id = e.target.value;
                  const label = e.target.options[e.target.selectedIndex]?.text || '';
                  setNewItem((p) => ({ ...p, unit: id, unit_label: label }));
                }}
                className="border p-2 w-full rounded"
              >
                <option value="">Seleccione Unidad</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.label}</option>
                ))}
              </select>
            </div>

            {/* 4) Descripción */}
            <div className="md:col-span-3">
              <label className="block mb-1 font-medium">Descripción</label>
              <input
                type="text"
                value={newItem.description}
                onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                className="border p-2 w-full rounded"
              />
            </div>

            {/* Add button */}
            <div className="md:col-span-12 flex justify-end">
              <button
                type="button"
                onClick={addItem}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Agregar
              </button>
            </div>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border rounded">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2 border">#</th>
                  <th className="p-2 border">Objeto del Gasto</th>
                  <th className="p-2 border">Cantidad</th>
                  <th className="p-2 border">Unidad de Medida</th>
                  <th className="p-2 border">Descripción</th>
                  <th className="p-2 border">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-3 text-center text-gray-500">
                      No hay partidas registradas.
                    </td>
                  </tr>
                )}
                {items.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="p-2 border">{idx + 1}</td>
                    <td className="p-2 border">{p.product_label}</td>
                    <td className="p-2 border">{p.quantity}</td>
                    <td className="p-2 border">{p.unit_label}</td>
                    <td className="p-2 border">{p.description}</td>
                    <td className="p-2 border">
                      <button
                        type="button"
                        onClick={() => removeItem(p.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-6 gap-2">
            <button type="button" onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Cancelar</button>
            <button type="button" onClick={handleNextFromStep2}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Siguiente</button>
          </div>
        </>
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
