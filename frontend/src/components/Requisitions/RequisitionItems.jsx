import React, { useEffect, useMemo, useRef, useState, useContext } from 'react';
import apiClient from '../../api/apiClient';
import { useToast } from '../../contexts/ToastContext';

export default function RequisitionItems({
  formData,
  items, setItems,
  requisitionNumber, setRequisitionNumber,
  onCancel,
  onNext,
}) {
  const { showToast } = useToast();

  // ============================
  // STEP 2: Registro de Partidas
  // ============================
  // Catalogs: Products (Objeto del Gasto) & Units (Unidad de Medida) & Item Descriptions (dependent)
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [descOptions, setDescOptions] = useState([]); // depends on selected product
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
        '/catalogs/expense-objects/',
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

    if (!catalogsFetched.current) {
      catalogsFetched.current = true;
      fetchCatalogs();
    }
  }, []);

  // Map product id -> label (for catalog popup)
  const productLabelById = useMemo(() => {
    const map = new Map();
    products.forEach(p => map.set(String(p.id), p.label));
    return map;
  }, [products]);

  // Load item descriptions filtered by product
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

  // Items editor state (new row)
  const [newItem, setNewItem] = useState({
    product: '',           // id
    product_label: '',     // display
    quantity: '',
    unit: '',              // id
    unit_label: '',        // display
    description: '',       // id from item-descriptions
    description_label: '', // display
  });

  const addItem = () => {
    const qty = Number(newItem.quantity);

    if (!newItem.product) return showToast('Selecciona el Objeto del Gasto (Producto).', 'error');
    if (!Number.isFinite(qty) || qty <= 0) return showToast('La cantidad debe ser mayor que 0.', 'error');
    if (!newItem.unit) return showToast('Selecciona la Unidad de Medida.', 'error');
    if (!newItem.description) return showToast('Selecciona la Descripción.', 'error'); // required dropdown

    const partida = {
      id: Date.now(),
      product: newItem.product,
      product_label: newItem.product_label,
      quantity: qty,
      unit: newItem.unit,
      unit_label: newItem.unit_label,
      description: newItem.description,             // send id to backend
      description_label: newItem.description_label, // show label in UI
    };
    setItems((prev) => [...prev, partida]);
    setNewItem({
      product: '', product_label: '',
      quantity: '',
      unit: '', unit_label: '',
      description: '', description_label: '',
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
            if (candidate !== null) {
              last = candidate;
              break;
            }
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

  // =========================================
  // REGISTRO MODAL (add new Item Description)
  // =========================================
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
    // Preselect currently chosen product (if any) to speed up entry
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
      } catch (e) {
        // try next
      }
    }
    throw new Error('No se pudo registrar con los endpoints conocidos.');
  };

  const submitRegistro = async () => {
    setRegError(null);

    if (!regProductId) {
      setRegError("Selecciona un 'Objeto del Gasto'.");
      return;
    }
    if (!regDescripcion.trim()) {
      setRegError("La 'Descripción del Producto' no puede estar vacía.");
      return;
    }

    try {
      setRegSaving(true);

      const payloadCandidates = [
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
      for (const p of payloadCandidates) {
        try {
          created = await tryPost(endpoints, p);
          if (created) break;
        } catch {
          // try next payload shape
        }
      }

      if (!created) throw new Error('No se pudo crear la descripción.');

      // Normalize created object
      const createdId = created.id ?? created.pk ?? created.uuid ?? null;
      const createdText = created.text ?? created.descripcion ?? created.name ?? created.label ?? regDescripcion.trim();

      // If modal product matches current selected product, refresh list and preselect new one.
      await loadDescriptionsByProduct(regProductId);

      if (newItem.product === regProductId && createdId) {
        setNewItem((p) => ({
          ...p,
          description: String(createdId),
          description_label: createdText,
        }));
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

  // =====================================
  // CATÁLOGO MODAL (browse descriptions)
  // =====================================
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState(null);
  const [catalogRows, setCatalogRows] = useState([]); // {id, productId, productLabel, text}

  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const perPageOptions = [10, 25, 50, 100];

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
          if (arr.length) {
            data = arr;
            break;
          }
        } catch {
          // try next
        }
      }

      if (!data) data = [];

      // Normalize to {id, productId, productLabel, text}
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

  // Build condensed page list: 1 … x-1 x x+1 … N
  const pageList = useMemo(() => {
    const pages = [];
    const N = totalPages;
    const windowSize = 1;
    if (N <= 7) {
      for (let i = 1; i <= N; i++) pages.push(i);
      return pages;
    }
    const add = (val) => pages.push(val);
    add(1);
    const left = Math.max(2, currentPage - windowSize);
    const right = Math.min(N - 1, currentPage + windowSize);

    if (left > 2) add('…');
    for (let i = left; i <= right; i++) add(i);
    if (right < N - 1) add('…');
    add(N);
    return pages;
  }, [currentPage, totalPages]);

  return (
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
              setNewItem((p) => ({
                ...p,
                product: id,
                product_label: label,
                // reset dependent description
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

        {/* 4) Descripción (dependent catalog) */}
        <div className="md:col-span-3">
          <label className="block mb-1 font-medium">Descripción</label>
          <select
            value={newItem.description}
            onChange={(e) => {
              const id = e.target.value;
              const label = e.target.options[e.target.selectedIndex]?.text || '';
              setNewItem((p) => ({ ...p, description: id, description_label: label }));
            }}
            disabled={!newItem.product} // disable until a product is selected
            className="border p-2 w-full rounded disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="">{newItem.product ? 'Seleccione Descripción' : 'Seleccione primero un Producto'}</option>
            {descOptions.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
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

      {/* Header with Clasificador + Ver Catálogo + Registrar (right side) */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Registro de Partidas</h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openPDF}
            className="inline-flex items-center gap-2 rounded-md border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
            title="Abrir el PDF del clasificador"
          >
            Clasificador
          </button>

          <button
            type="button"
            onClick={openCatalog}
            className="inline-flex items-center gap-2 rounded-md border border-blue-300 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
            title="Ver Catálogo"
          >
            Ver Catálogo
          </button>

          <button
            type="button"
            onClick={openRegistro}
            className="inline-flex items-center gap-2 rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            title="Registrar nueva Descripción"
          >
            Registrar
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

      <div className="flex justify-between mt-6 gap-2">
        <button type="button" onClick={onCancel}
          className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded">Cancelar</button>
        <button type="button" onClick={onNext}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Siguiente</button>
      </div>

      {/* =========================
          Modal: Registro (popup)
          ========================= */}
      {showRegistroModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeRegistro}
            aria-hidden="true"
          />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Registro</h3>
            </div>

            {/* Objeto del Gasto */}
            <label className="block text-sm font-medium mb-1">Objeto del Gasto</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={regProductId}
              onChange={(e) => setRegProductId(e.target.value)}
            >
              <option value="">Selecciona…</option>
              {products.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>

            {/* Descripción del Producto */}
            <label className="block text-sm font-medium mb-1">
              Descripción del Producto
            </label>
            <input
              type="text"
              placeholder="Ej. Laptop 14” Core i5, 16GB RAM…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-300"
              value={regDescripcion}
              onChange={(e) => setRegDescripcion(e.target.value)}
            />

            {/* Errors on save */}
            {regError && (
              <div className="text-sm text-red-600 mb-3">{regError}</div>
            )}

            {/* Actions */}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeRegistro}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={regSaving}
                onClick={submitRegistro}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {regSaving ? "Registrando…" : "Registrar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================
          Modal: Catálogo (popup)
          ========================== */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCatalog}
            aria-hidden="true"
          />

        {/* Modal */}
        <div className="relative z-10 w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Catálogo</h3>
          </div>

          {/* Controls */}
          <div className="mb-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm">Mostrar</span>
              <select
                value={entriesPerPage}
                onChange={(e) => { setEntriesPerPage(Number(e.target.value)); setPage(1); }}
                className="border rounded px-2 py-1 text-sm"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="text-sm">entradas</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="border rounded px-2 py-1 text-sm w-64"
                placeholder="Buscar por Objeto del Gasto o Descripción…"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2 border">Objeto del Gasto</th>
                  <th className="p-2 border">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {catalogLoading && (
                  <tr>
                    <td colSpan="2" className="p-3 text-center text-gray-500">Cargando…</td>
                  </tr>
                )}
                {(!catalogLoading && pageRows.length === 0) && (
                  <tr>
                    <td colSpan="2" className="p-3 text-center text-gray-500">Sin resultados.</td>
                  </tr>
                )}
                {pageRows.map((r) => (
                  <tr key={`${r.id}`}>
                    <td className="p-2 border">{r.productLabel}</td>
                    <td className="p-2 border">{r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer: left info + right pagination */}
          <div className="mt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-gray-600">
              {totalEntries > 0 ? (
                <>Mostrando {startIndex + 1} de {entriesPerPage} de {totalEntries} entradas totales</>
              ) : (
                <>Mostrando 0 de {entriesPerPage} de 0 entradas totales</>
              )}
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-1">
              <button
                className="px-2 py-1 text-sm border rounded disabled:opacity-50"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                Anterior
              </button>

              {pageList.map((p, idx) => (
                typeof p === 'number' ? (
                  <button
                    key={`p-${p}-${idx}`}
                    className={`px-2 py-1 text-sm border rounded ${p === currentPage ? 'bg-blue-600 text-white border-blue-600' : ''}`}
                    onClick={() => goToPage(p)}
                  >
                    {p}
                  </button>
                ) : (
                  <span key={`dots-${idx}`} className="px-2 py-1 text-sm">…</span>
                )
              ))}

              <button
                className="px-2 py-1 text-sm border rounded disabled:opacity-50"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Siguiente
              </button>
            </div>
          </div>

          {/* Bottom Close button */}
          <div className="mt-4">
            <button
              onClick={closeCatalog}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
      )}
    </>
  );
}
