// frontend/src/components/Requisitions/RequisitionItems.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../../api/apiClient';
import { useToast } from '../../contexts/ToastContext';

export default function RequisitionItems({
  formData,
  items, setItems,
  requisitionNumber, setRequisitionNumber,

  // ✅ NUEVO: viene del padre (create wizard)
  ackCostRealistic = false,
  setAckCostRealistic = () => {},
}) {
  const { showToast } = useToast();

  // ============================
  // STEP 2: Registro de Partidas
  // ============================
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [descOptions, setDescOptions] = useState([]);
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
        } catch { /* try next */ }
      }
      return [];
    };

    const fetchCatalogs = async () => {
      const prodArr = await tryGet([
        '/catalogs/products/',
        '/products/',
        '/catalogs/items/',
        '/catalogs/expense-objects/',
      ]);
      setProducts(prodArr.map(p => ({ id: p.id, label: labelOf(p) })));

      const unitArr = await tryGet([
        '/catalogs/units/',
        '/catalogs/measurement-units/',
        '/catalogs/uoms/',
        '/units/',
      ]);
      setUnits(unitArr.map(u => ({ id: u.id, label: labelOf(u) })));
    };

    if (!catalogsFetched.current) {
      catalogsFetched.current = true;
      fetchCatalogs();
    }
  }, []);

  const productLabelById = useMemo(() => {
    const map = new Map();
    products.forEach(p => map.set(String(p.id), p.label));
    return map;
  }, [products]);

  const loadDescriptionsByProduct = async (productId) => {
    if (!productId) {
      setDescOptions([]);
      return;
    }
    try {
      const res = await apiClient.get(`/catalogs/item-descriptions/?product=${productId}`);
      const arr = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      const options = arr
        .map((d) => ({ id: d.id, label: d.text }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));
      setDescOptions(options);
    } catch (e) {
      console.error('Error loading item-descriptions by product:', e);
      showToast?.('Error al cargar descripciones para el producto.', 'error');
      setDescOptions([]);
    }
  };

  const computeTotal = (qtyStr, unitStr) => {
    const qty = Number(qtyStr);
    const unit = Number(unitStr);
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(unit) && unit > 0) {
      return (qty * unit).toFixed(2);
    }
    return '';
  };

  const [newItem, setNewItem] = useState({
    product: '',
    product_label: '',
    quantity: '',
    unit: '',
    unit_label: '',
    description: '',
    description_label: '',
    estimated_unit_cost: '',
    estimated_total: '',
  });

  const addItem = () => {
    const qty = Number(newItem.quantity);
    const unitCost = newItem.estimated_unit_cost === '' ? NaN : Number(newItem.estimated_unit_cost);
    const total = Number(newItem.estimated_total);

    if (!newItem.product) return showToast('Selecciona el Objeto del Gasto (Producto).', 'error');
    if (!Number.isFinite(qty) || qty <= 0) return showToast('La cantidad debe ser mayor que 0.', 'error');
    if (!newItem.unit) return showToast('Selecciona la Unidad de Medida.', 'error');
    if (!newItem.description) return showToast('Selecciona la Descripción.', 'error');

    if (newItem.estimated_unit_cost !== '' && (!Number.isFinite(unitCost) || unitCost <= 0)) {
      return showToast('El Costo unitario debe ser mayor que 0 (o déjalo vacío).', 'error');
    }

    if (!Number.isFinite(total) || total <= 0) {
      return showToast('El Monto estimado (total) debe ser mayor que 0.', 'error');
    }

    const partida = {
      id: Date.now(),
      product: newItem.product,
      product_label: newItem.product_label,
      quantity: qty,
      unit: newItem.unit,
      unit_label: newItem.unit_label,
      description: newItem.description,
      description_label: newItem.description_label,
      estimated_unit_cost: newItem.estimated_unit_cost === '' ? undefined : Number(unitCost.toFixed(2)),
      estimated_total: Number(total.toFixed(2)),
    };

    setItems((prev) => [...prev, partida]);

    setNewItem({
      product: '', product_label: '',
      quantity: '',
      unit: '', unit_label: '',
      description: '', description_label: '',
      estimated_unit_cost: '',
      estimated_total: '',
    });

    setDescOptions([]);
  };

  const removeItem = (id) => setItems((prev) => prev.filter((p) => p.id !== id));

  // ===== Requisition Number (auto) =====
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
            if (candidate !== null) { last = candidate; break; }
          } catch { /* try next */ }
        }
        const next = (last ?? 0) + 1;
        setRequisitionNumber(String(next));
      } catch (err) {
        console.error('No se pudo obtener el último número de requisición:', err);
        setRequisitionNumber('1');
      }
    };

    if (!tempNumberFetched.current) {
      tempNumberFetched.current = true;
      fetchTempNumber();
    }
  }, [setRequisitionNumber]);

  // ======= Registro modal =======
  const [showRegistroModal, setShowRegistroModal] = useState(false);
  const [regProductId, setRegProductId] = useState('');
  const [regDescripcion, setRegDescripcion] = useState('');
  const [regSaving, setRegSaving] = useState(false);
  const [regError, setRegError] = useState(null);

  const openPDF = () => {
    const url = `${process.env.PUBLIC_URL}/docs/clasificador.pdf`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const openRegistro = () => {
    setRegError(null);
    setShowRegistroModal(true);
    if (newItem.product) setRegProductId(newItem.product);
  };

  const closeRegistro = () => {
    setShowRegistroModal(false);
    setRegProductId('');
    setRegDescripcion('');
    setRegSaving(false);
    setRegError(null);
  };

  const tryPost = async (urls, payload) => {
    for (const url of urls) {
      try {
        const res = await apiClient.post(url, payload);
        return res.data;
      } catch { /* try next */ }
    }
    throw new Error('No se pudo registrar con los endpoints conocidos.');
  };

  const submitRegistro = async () => {
    setRegError(null);
    if (!regProductId) return setRegError("Selecciona un 'Objeto del Gasto'.");
    if (!regDescripcion.trim()) return setRegError("La 'Descripción del Producto' no puede estar vacía.");

    try {
      setRegSaving(true);

      const payloads = [
        { product: regProductId, text: regDescripcion.trim() },
        { product_id: regProductId, text: regDescripcion.trim() },
        { producto: regProductId, descripcion: regDescripcion.trim() },
      ];
      const endpoints = [
        '/catalogs/item-descriptions/',
        '/item-descriptions/',
        '/catalogs/descriptions/',
      ];

      let created = null;
      for (const p of payloads) {
        try {
          created = await tryPost(endpoints, p);
          if (created) break;
        } catch { /* next payload */ }
      }
      if (!created) throw new Error('No se pudo crear la descripción.');

      const createdId = created.id ?? created.pk ?? created.uuid ?? null;
      const createdText = created.text ?? created.descripcion ?? created.name ?? created.label ?? regDescripcion.trim();

      await loadDescriptionsByProduct(regProductId);
      if (newItem.product === regProductId && createdId) {
        setNewItem((p) => ({ ...p, description: String(createdId), description_label: createdText }));
      }

      showToast?.('Descripción registrada correctamente.', 'success');
      closeRegistro();
    } catch (e) {
      console.error('submitRegistro error:', e);
      setRegError('No se pudo registrar. Revisa los datos e inténtalo de nuevo.');
    } finally {
      setRegSaving(false);
    }
  };

  // ======= Catálogo modal =======
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogRows, setCatalogRows] = useState([]);

  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const openCatalog = async () => {
    setShowCatalogModal(true);
    setCatalogError(null);
    setSearchQuery('');
    setEntriesPerPage(10);
    setPage(1);

    try {
      setCatalogLoading(true);
      const urls = [
        '/catalogs/item-descriptions/',
        '/item-descriptions/',
        '/catalogs/descriptions/',
      ];

      let data = null;
      for (const url of urls) {
        try {
          const res = await apiClient.get(url);
          const arr = Array.isArray(res.data) ? res.data : (res.data?.results || []);
          if (arr.length) { data = arr; break; }
        } catch { /* try next */ }
      }
      if (!data) data = [];

      const normalized = data.map((d) => {
        const productId = String(d.product ?? d.product_id ?? d.producto ?? d.producto_id ?? '');
        const text = d.text ?? d.descripcion ?? d.name ?? d.label ?? '';
        const productLabel = productLabelById.get(productId) || productId || '—';
        return { id: d.id ?? d.pk ?? d.uuid ?? Math.random(), productId, productLabel, text };
      });

      setCatalogRows(normalized);
    } catch (e) {
      console.error('openCatalog error:', e);
      setCatalogError('No se pudo cargar el catálogo.');
    } finally {
      setCatalogLoading(false);
    }
  };

  const closeCatalog = () => {
    setShowCatalogModal(false);
    setCatalogRows([]);
    setSearchQuery('');
    setCatalogError(null);
    setCatalogLoading(false);
    setPage(1);
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogRows;
    return catalogRows.filter(r =>
      (r.text || '').toLowerCase().includes(q) ||
      (r.productLabel || '').toLowerCase().includes(q)
    );
  }, [catalogRows, searchQuery]);

  const totalEntries = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / entriesPerPage));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const pageRows = filteredRows.slice(startIndex, endIndex);

  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  const pageList = useMemo(() => {
    const pages = [];
    const N = totalPages;
    const windowSize = 1;
    if (N <= 7) { for (let i = 1; i <= N; i++) pages.push(i); return pages; }
    pages.push(1);
    const left = Math.max(2, currentPage - windowSize);
    const right = Math.min(N - 1, currentPage + windowSize);
    if (left > 2) pages.push('…');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < N - 1) pages.push('…');
    pages.push(N);
    return pages;
  }, [currentPage, totalPages]);

  // ✅ Handlers LIMPIOS (sin inline)
  const handleOpenCatalog = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCatalog();
  };

  const handleOpenRegistro = (e) => {
    e.preventDefault();
    e.stopPropagation();
    openRegistro();
  };

  const handleToggleAckCostRealistic = (e) => {
    setAckCostRealistic(e.target.checked);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-2 mb-4">
        <h2 className="text-xl font-semibold">
          Requisicion No. {requisitionNumber || '...'} Información de registro
        </h2>
      </div>

      <h3 className="text-lg font-semibold mb-3">Resumen</h3>
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

      <div className="my-6 border-t border-gray-200" />

      <h3 className="text-lg font-semibold mb-2">Registro de Partidas</h3>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end mb-3">
        <div className="md:col-span-4">
          <label className="block mb-1 font-medium">Objeto del Gasto</label>
          <select
            value={newItem.product}
            onChange={(e) => {
              const id = e.target.value;
              const label = e.target.options[e.target.selectedIndex]?.text || '';
              setNewItem((p) => ({
                ...p,
                product: id,
                product_label: label,
                description: '',
                description_label: '',
              }));
              loadDescriptionsByProduct(id);
            }}
            className="border p-2 w-full rounded"
          >
            <option value="">Seleccione Objeto del Gasto</option>
            {products.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block mb-1 font-medium">Cantidad</label>
          <input
            type="number"
            min="0"
            step="1"
            value={newItem.quantity}
            onChange={(e) => {
              const val = e.target.value;
              setNewItem((p) => ({
                ...p,
                quantity: val,
                estimated_total: computeTotal(val, p.estimated_unit_cost) || p.estimated_total,
              }));
            }}
            className="border p-2 w-full rounded"
          />
        </div>

        <div className="md:col-span-2">
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

        <div className="md:col-span-2">
          <label className="block mb-1 font-medium">Costo unitario</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newItem.estimated_unit_cost}
            onChange={(e) => {
              const val = e.target.value;
              setNewItem((p) => ({
                ...p,
                estimated_unit_cost: val,
                estimated_total: computeTotal(p.quantity, val) || p.estimated_total,
              }));
            }}
            className="border p-2 w-full rounded"
            placeholder="0.00"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block mb-1 font-medium">Monto estimado (total)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={newItem.estimated_total}
            onChange={(e) => setNewItem((p) => ({ ...p, estimated_total: e.target.value }))}
            className="border p-2 w-full rounded"
            placeholder="0.00"
          />
        </div>

        <div className="md:col-span-12">
          <label className="block mb-1 font-medium">Descripción</label>
          <select
            value={newItem.description}
            onChange={(e) => {
              const id = e.target.value;
              const label = e.target.options[e.target.selectedIndex]?.text || '';
              setNewItem((p) => ({ ...p, description: id, description_label: label }));
            }}
            disabled={!newItem.product}
            className="border p-2 w-full rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">{newItem.product ? 'Seleccione Descripción' : 'Seleccione primero un Producto'}</option>
            {descOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPDF}
            className="inline-flex items-center gap-2 rounded-md border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Clasificador
          </button>

          <button
            type="button"
            onClick={handleOpenCatalog}
            className="inline-flex items-center gap-2 rounded-md border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Ver Catálogo
          </button>

          <button
            type="button"
            onClick={handleOpenRegistro}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Registrar
          </button>

          <button
            type="button"
            onClick={addItem}
            className="inline-flex items-center gap-2 rounded-md border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50"
          >
            Agregar
          </button>
        </div>
      </div>

      <div className="my-4 border-t border-gray-200" />

      <h2 className="text-lg font-semibold mb-3">Partidas registradas</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">#</th>
              <th className="p-2 border">Objeto del Gasto</th>
              <th className="p-2 border">Cantidad</th>
              <th className="p-2 border">Unidad</th>
              <th className="p-2 border">Unitario</th>
              <th className="p-2 border">Total</th>
              <th className="p-2 border">Descripción</th>
              <th className="p-2 border">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan="8" className="p-3 text-center text-gray-500">
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
                <td className="p-2 border">{p.estimated_unit_cost ? Number(p.estimated_unit_cost).toFixed(2) : '—'}</td>
                <td className="p-2 border">{Number(p.estimated_total).toLocaleString('es-MX')}</td>
                <td className="p-2 border">{p.description_label}</td>
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

      <div className="mt-6 border rounded p-3 bg-gray-50">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={!!ackCostRealistic}
            onChange={handleToggleAckCostRealistic}
          />
          <span className="text-sm">
            Confirma <strong>“costo aproximado realista”</strong> para imprimir/exportar PDF.
          </span>
        </label>
      </div>

      {showCatalogModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={closeCatalog}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative z-[10000] w-full max-w-6xl rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Catálogo de Descripciones</h3>
              <button
                type="button"
                className="h-9 w-9 rounded bg-gray-200 hover:bg-gray-300"
                onClick={closeCatalog}
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex-1 min-w-[260px]">
                <label className="block text-xs font-medium text-gray-700 mb-1">Buscar</label>
                <input
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  className="w-full border rounded px-3 py-2"
                  placeholder="Buscar por producto o descripción..."
                />
              </div>

              <div className="w-40">
                <label className="block text-xs font-medium text-gray-700 mb-1">Por página</label>
                <select
                  value={entriesPerPage}
                  onChange={(e) => { setEntriesPerPage(Number(e.target.value)); setPage(1); }}
                  className="w-full border rounded px-3 py-2"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {catalogError && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {catalogError}
              </div>
            )}

            <div className="border rounded overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Objeto del Gasto</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogLoading ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-gray-500">Cargando...</td></tr>
                  ) : pageRows.length === 0 ? (
                    <tr><td colSpan={2} className="px-3 py-6 text-center text-gray-500">Sin resultados.</td></tr>
                  ) : (
                    pageRows.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{r.productLabel}</td>
                        <td className="px-3 py-2">{r.text}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-gray-600">
                Mostrando {totalEntries === 0 ? 0 : startIndex + 1}–{endIndex} de {totalEntries}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  className="px-2 py-1 rounded border hover:bg-gray-50"
                  disabled={currentPage <= 1}
                >
                  ‹
                </button>

                {pageList.map((p, i) =>
                  p === '…' ? (
                    <span key={`dots-${i}`} className="px-2 py-1 text-gray-500">…</span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      className={`px-3 py-1 rounded border hover:bg-gray-50 ${p === currentPage ? 'bg-blue-600 text-white border-blue-600' : ''}`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  className="px-2 py-1 rounded border hover:bg-gray-50"
                  disabled={currentPage >= totalPages}
                >
                  ›
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={closeCatalog}
                className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {showRegistroModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={closeRegistro}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative z-[10000] w-full max-w-3xl rounded-xl bg-white p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Registrar Descripción</h3>
              <button
                type="button"
                className="h-9 w-9 rounded bg-gray-200 hover:bg-gray-300"
                onClick={closeRegistro}
              >
                ✕
              </button>
            </div>

            {regError && (
              <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {regError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del Gasto</label>
                <select
                  className="w-full border rounded px-3 py-2"
                  value={regProductId}
                  onChange={(e) => setRegProductId(e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={regDescripcion}
                  onChange={(e) => setRegDescripcion(e.target.value)}
                  placeholder="Escribe la nueva descripción"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRegistro}
                className="rounded bg-gray-200 px-4 py-2 hover:bg-gray-300"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={regSaving}
                onClick={submitRegistro}
                className={`rounded px-4 py-2 text-white ${regSaving ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {regSaving ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
