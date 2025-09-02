// frontend/src/components/Requisitions/RequisitionEditWizard.jsx
import React, { useEffect, useState } from "react";
import apiClient from "../../api/apiClient";
import LoadingSpinner from "../UI/LoadingSpinner";

/* ────────────────────────────────────────────────────────────────────────────
   Step 1 catalog endpoints: try multiple candidates until one works.
---------------------------------------------------------------------------- */
const CATALOG_CANDIDATES = {
  administrative_unit: [
    "/catalogs/administrative-units/",
    "/catalogs/administrative_units/",
    "/catalogs/admin-units/",
    "/catalogs/admin_units/",
  ],
  requesting_department: [
    "/catalogs/departments/",
    "/catalogs/requesting-departments/",
    "/catalogs/requesting_departments/",
  ],
  project: ["/catalogs/projects/"],
  funding_source: [
    "/catalogs/funding-sources/",
    "/catalogs/funding_sources/",
    "/catalogs/funding/",
  ],
  budget_unit: [
    "/catalogs/budget-units/",
    "/catalogs/budget_units/",
  ],
  agreement: ["/catalogs/agreements/"],
  category: ["/catalogs/categories/"],
  tender: ["/catalogs/tenders/"],
  external_service: [
    "/catalogs/external-services/",
    "/catalogs/external_services/",
    "/catalogs/services/",
  ],
};

const CATALOG_META = {
  administrative_unit: { uiLabel: "Unidad Administrativa" },
  requesting_department: { uiLabel: "Departamento Solicitante" },
  project: { uiLabel: "Proyecto" },
  funding_source: { uiLabel: "Fuente de Financiamiento" },
  budget_unit: { uiLabel: "Unidad Presupuestal" },
  agreement: { uiLabel: "Convenios" },
  category: { uiLabel: "Categoría" },
  tender: { uiLabel: "Licitación" },
  external_service: { uiLabel: "Servicio Externo / Académico" },
};

const getIdDefault = (r) => r.id;
const getLabelDefault = (r) => r.name ?? r.description ?? r.code ?? String(r.id);
const coerceId = (v) => (typeof v === "object" && v ? v.id : Number(v || "") || "");

// Try each endpoint candidate until one responds OK
async function fetchFirstOk(urls) {
  for (const u of urls) {
    try {
      const resp = await apiClient.get(u);
      if (Array.isArray(resp.data)) return resp.data;
      if (resp.data?.results && Array.isArray(resp.data.results)) return resp.data.results;
    } catch (e) {
      console.warn(`[catalog] ${u} → ${e?.response?.status || e.message}`);
    }
  }
  throw new Error(`All candidates failed: ${urls.join(", ")}`);
}

/* ────────────────────────────────────────────────────────────────────────────
   Step 2 (items) catalog endpoints
---------------------------------------------------------------------------- */
const STEP2_SPECS = {
  productsUrl: "/catalogs/products/",
  unitsUrl: "/catalogs/units/",
  itemDescriptionsUrl: (productId) => `/catalogs/item-descriptions/?product=${productId}`,
  itemDescriptionsPostUrl: "/catalogs/item-descriptions/",
};

export default function RequisitionEditWizard({ requisition, onSaved }) {
  const [step, setStep] = useState(1);

  /* ───────────────────────── Step 1: editable header ─────────────────────── */
  const [headerForm, setHeaderForm] = useState({
    administrative_unit: "",
    requesting_department: "",
    project: "",
    funding_source: "",
    budget_unit: "",
    agreement: "",
    category: "",
    tender: "",
    external_service: "",
    created_at: "",
    requisition_reason: "",
  });
  const [catalogs, setCatalogs] = useState({});
  const [loadingStep1, setLoadingStep1] = useState(false);

  useEffect(() => {
    if (!requisition) return;
    const createdISO = requisition.created_at ? new Date(requisition.created_at) : null;
    const yyyyMMdd = createdISO
      ? `${createdISO.getFullYear()}-${String(createdISO.getMonth() + 1).padStart(2, "0")}-${String(createdISO.getDate()).padStart(2, "0")}`
      : "";
    setHeaderForm((prev) => ({
      ...prev,
      administrative_unit: coerceId(requisition.administrative_unit),
      requesting_department: coerceId(requisition.requesting_department),
      project: coerceId(requisition.project),
      funding_source: coerceId(requisition.funding_source),
      budget_unit: coerceId(requisition.budget_unit),
      agreement: coerceId(requisition.agreement),
      category: coerceId(requisition.category),
      tender: coerceId(requisition.tender),
      external_service: coerceId(requisition.external_service),
      created_at: yyyyMMdd,
      requisition_reason: requisition.requisition_reason || "",
    }));
  }, [requisition]);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoadingStep1(true);
      try {
        const keys = Object.keys(CATALOG_CANDIDATES);
        const results = await Promise.allSettled(
          keys.map((k) => fetchFirstOk(CATALOG_CANDIDATES[k]))
        );
        if (cancelled) return;
        const next = {};
        results.forEach((res, idx) => {
          const key = keys[idx];
          next[key] = res.status === "fulfilled" ? res.value : [];
          if (res.status !== "fulfilled") {
            console.error(`[catalog] Failed to load "${key}":`, res.reason?.message || res.reason);
          }
        });
        setCatalogs(next);
      } finally {
        if (!cancelled) setLoadingStep1(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  const onChangeHeader = (key, value) =>
    setHeaderForm((f) => ({ ...f, [key]: value }));

  /* ───────────────────────── Step 2: items & notes ───────────────────────── */
  const [items, setItems] = useState([]);
  const [observations, setObservations] = useState("");

  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [descOptions, setDescOptions] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  const [form, setForm] = useState({
    id: null,
    product: "",
    quantity: "",
    unit: "",
    description: "",
  });

  // Modals for “Ver Catálogo” & “Registrar”
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [catalogModalProduct, setCatalogModalProduct] = useState("");
  const [catalogModalDescs, setCatalogModalDescs] = useState([]);
  const [registerForm, setRegisterForm] = useState({ product: "", text: "" });
  const [busyRegister, setBusyRegister] = useState(false);

  const [busySave, setBusySave] = useState(false);

  useEffect(() => {
    if (!requisition) return;
    setItems(
      (requisition.items || []).map((it) => ({
        id: it.id,
        product: it.product,
        quantity: it.quantity,
        unit: it.unit,
        description: it.description,
      }))
    );
    setObservations(requisition.observations || "");
  }, [requisition]);

  useEffect(() => {
    if (step !== 2) return;
    let cancelled = false;
    async function load() {
      setLoadingCatalogs(true);
      try {
        const [prods, ums] = await Promise.all([
          apiClient.get(STEP2_SPECS.productsUrl),
          apiClient.get(STEP2_SPECS.unitsUrl),
        ]);
        if (!cancelled) {
          setProducts(prods.data || []);
          setUnits(ums.data || []);
        }
      } finally {
        if (!cancelled) setLoadingCatalogs(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [step]);

  useEffect(() => {
    const pid = form.product;
    if (!pid) {
      setDescOptions([]);
      return;
    }
    let cancelled = false;
    async function run() {
      try {
        const resp = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(pid));
        if (!cancelled) setDescOptions(resp.data || []);
      } catch {
        if (!cancelled) setDescOptions([]);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [form.product]);

  const goNext = () => setStep((s) => Math.min(2, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  const addOrUpdateItem = (e) => {
    e.preventDefault();
    const { id, product, quantity, unit, description } = form;
    if (!product || !quantity || !unit || !description) {
      alert("Completa Objeto del Gasto, Cantidad, Unidad y Descripción.");
      return;
    }
    const normalized = {
      id: id ?? undefined,
      product: Number(product),
      quantity: Number(quantity),
      unit: Number(unit),
      description: Number(description),
    };
    if (id) {
      setItems((prev) => prev.map((row) => (row.id === id ? normalized : row)));
    } else {
      setItems((prev) => [...prev, normalized]);
    }
    setForm({ id: null, product: "", quantity: "", unit: "", description: "" });
  };

  const editRow = (row) => {
    setForm({
      id: row.id ?? null,
      product: String(row.product || ""),
      quantity: String(row.quantity || ""),
      unit: String(row.unit || ""),
      description: String(row.description || ""),
    });
    if (step !== 2) setStep(2);
  };

  const deleteRow = (rowId) => {
    if (!window.confirm("¿Eliminar este artículo?")) return;
    setItems((prev) => prev.filter((r) => r.id !== rowId));
  };

  const openClassifier = () => {
    window.open("/docs/clasificador.pdf", "_blank", "noopener");
  };

  /* ──────────────── “Ver Catálogo” modal behaviors ──────────────────────── */
  const openCatalogModal = () => {
    setCatalogModalProduct(form.product || "");
    setCatalogModalDescs([]);
    setShowCatalogModal(true);
  };

  useEffect(() => {
    if (!showCatalogModal) return;
    if (!catalogModalProduct) {
      setCatalogModalDescs([]);
      return;
    }
    let cancelled = false;
    async function fetchDescs() {
      try {
        const resp = await apiClient.get(
          STEP2_SPECS.itemDescriptionsUrl(catalogModalProduct)
        );
        if (!cancelled) setCatalogModalDescs(resp.data || []);
      } catch (e) {
        if (!cancelled) setCatalogModalDescs([]);
      }
    }
    fetchDescs();
    return () => { cancelled = true; };
  }, [showCatalogModal, catalogModalProduct]);

  /* ───────────────── “Registrar” (nuevo ItemDescription) ─────────────────── */
  const openRegisterModal = () => {
    setRegisterForm({
      product: form.product || "",
      text: "",
    });
    setShowRegisterModal(true);
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (!registerForm.product || !registerForm.text.trim()) {
      alert("Selecciona Objeto del Gasto y escribe la descripción.");
      return;
    }
    setBusyRegister(true);
    try {
      const payload = {
        product: Number(registerForm.product),
        text: registerForm.text.trim(),
      };
      const resp = await apiClient.post(STEP2_SPECS.itemDescriptionsPostUrl, payload);
      // Refresh description lists when relevant
      if (String(form.product) === String(registerForm.product)) {
        try {
          const refresh = await apiClient.get(
            STEP2_SPECS.itemDescriptionsUrl(form.product)
          );
          setDescOptions(refresh.data || []);
        } catch {}
      }
      if (String(catalogModalProduct) === String(registerForm.product)) {
        try {
          const refresh = await apiClient.get(
            STEP2_SPECS.itemDescriptionsUrl(catalogModalProduct)
          );
          setCatalogModalDescs(refresh.data || []);
        } catch {}
      }
      // Preselect the new description
      setForm((f) => ({
        ...f,
        product: String(registerForm.product),
        description: String(resp.data?.id ?? ""),
      }));
      setShowRegisterModal(false);
      alert("Descripción registrada correctamente.");
    } catch (err) {
      console.error(err);
      alert("No se pudo registrar la descripción.");
    } finally {
      setBusyRegister(false);
    }
  };

  /* ─────────────────────────── SAVE (PUT) ────────────────────────────────── */
  const saveAll = async () => {
    setBusySave(true);
    try {
      const payload = {
        requesting_department: numOrNull(headerForm.requesting_department),
        project: numOrNull(headerForm.project),
        funding_source: numOrNull(headerForm.funding_source),
        budget_unit: numOrNull(headerForm.budget_unit),
        agreement: numOrNull(headerForm.agreement),
        category: numOrNull(headerForm.category),
        tender: numOrNull(headerForm.tender),
        external_service: numOrNull(headerForm.external_service),
        // created_at read-only in UI; backend may ignore on update
        created_at: headerForm.created_at || null,
        requisition_reason: headerForm.requisition_reason ?? "",
        observations,
        items,
      };
      // Not sending administrative_unit (hidden in UI)
      const resp = await apiClient.put(`/requisitions/${requisition.id}/`, payload);
      onSaved?.(resp.data);
      alert(`Requisición #${requisition.id} guardada correctamente.`);
    } catch (err) {
      console.error(err);
      alert("No se pudo guardar. Revisa los datos.");
    } finally {
      setBusySave(false);
    }
  };

  if (!requisition) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Banner */}
      <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded mb-4">
        <strong>Editar Requisición #{requisition.id}</strong>
        <div className="text-sm">Estatus actual: {requisition.status}</div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        <div className={`px-3 py-1 rounded-full text-sm ${step === 1 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          Paso 1 — Información General
        </div>
        <div className={`px-3 py-1 rounded-full text-sm ${step === 2 ? "bg-blue-600 text-white" : "bg-gray-200"}`}>
          Paso 2 — Registro de Partidas
        </div>
      </div>

      {/* STEP 1: EDITABLE (Unidad Administrativa OCULTA, Fecha read-only) */}
      {step === 1 && (
        <section className="bg-white rounded-xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Información general</h2>

          {loadingStep1 ? (
            <LoadingSpinner />
          ) : (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              {Object.keys(CATALOG_META)
                .filter((key) => key !== "administrative_unit") // hidden
                .map((key) => (
                  <SelectField
                    key={key}
                    label={CATALOG_META[key].uiLabel}
                    value={String(headerForm[key] ?? "")}
                    onChange={(v) => onChangeHeader(key, v)}
                    options={catalogs[key] || []}
                    getId={getIdDefault}
                    getLabel={getLabelDefault}
                    placeholder={`Selecciona ${CATALOG_META[key].uiLabel.toLowerCase()}`}
                  />
                ))}

              {/* Fecha de creación (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de creación</label>
                <div className="px-2 py-1 border rounded bg-gray-100 text-gray-700">
                  {headerForm.created_at || "—"}
                </div>
              </div>

              {/* Motivos */}
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Motivos de Requisición</label>
                <textarea
                  rows={4}
                  className="w-full border rounded px-2 py-1"
                  value={headerForm.requisition_reason}
                  onChange={(e) => onChangeHeader("requisition_reason", e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={goNext}
              className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Siguiente
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: Items + Observaciones with right-aligned catalog buttons */}
      {step === 2 && (
        <section className="bg-white rounded-xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Registro de Partidas</h2>

          {loadingCatalogs ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Inline editor */}
              <form onSubmit={addOrUpdateItem} className="grid md:grid-cols-4 gap-3">
                {/* Objeto del Gasto */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del Gasto</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.product}
                    onChange={(e) => setForm((f) => ({ ...f, product: e.target.value, description: "" }))}
                  >
                    <option value="">— Selecciona —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cantidad */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border rounded px-2 py-1"
                    value={form.quantity}
                    onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  />
                </div>

                {/* Unidad */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unidad</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                  >
                    <option value="">— Selecciona —</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Descripción */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    disabled={!form.product}
                  >
                    <option value="">{form.product ? "— Selecciona —" : "Selecciona Objeto del Gasto primero"}</option>
                    {descOptions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.text}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action row: Agregar on left | (right) Clasificador / Ver Catálogo / Registrar */}
                <div className="md:col-span-4 flex items-center gap-2">
                  <button type="submit" className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700">
                    {form.id ? "Guardar cambios" : "Agregar"}
                  </button>
                  {form.id && (
                    <button
                      type="button"
                      className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      onClick={() => setForm({ id: null, product: "", quantity: "", unit: "", description: "" })}
                    >
                      Cancelar edición
                    </button>
                  )}

                  {/* push catalog buttons to the right */}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openClassifier}
                      className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
                    >
                      Clasificador
                    </button>
                    <button
                      type="button"
                      onClick={openCatalogModal}
                      className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300"
                    >
                      Ver Catálogo
                    </button>
                    <button
                      type="button"
                      onClick={openRegisterModal}
                      className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Registrar
                    </button>
                  </div>
                </div>
              </form>

              {/* Items table */}
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Productos registrados</h3>
                <div className="border rounded overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-2 text-left">Objeto del Gasto</th>
                        <th className="px-2 py-2 text-center">Cantidad</th>
                        <th className="px-2 py-2 text-center">Unidad</th>
                        <th className="px-2 py-2 text-left">Descripción</th>
                        <th className="px-2 py-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td className="px-2 py-3 text-center text-gray-500" colSpan={5}>
                            Aún no has agregado partidas.
                          </td>
                        </tr>
                      ) : (
                        items.map((row, idx) => (
                          <tr key={row.id ?? `tmp-${idx}`} className="border-t">
                            <td className="px-2 py-2">
                              {labelFrom(products, row.product, (r) => r.description)}
                            </td>
                            <td className="px-2 py-2 text-center">{row.quantity}</td>
                            <td className="px-2 py-2 text-center">
                              {labelFrom(units, row.unit, (r) => r.name)}
                            </td>
                            <td className="px-2 py-2">{String(row.description)}</td>
                            <td className="px-2 py-2">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                                  onClick={() => editRow(row)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                                  onClick={() => deleteRow(row.id)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Observaciones */}
              <div className="mt-6">
                <label className="block text-xs font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea
                  rows={4}
                  className="w-full border rounded px-2 py-1"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                />
              </div>

              {/* Footer actions */}
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={goPrev}
                  className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={busySave}
                  onClick={saveAll}
                  className={`px-4 py-2 rounded text-white ${busySave ? "bg-green-400" : "bg-green-600 hover:bg-green-700"}`}
                >
                  {busySave ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ───────────── Modals ───────────── */}

      {/* Ver Catálogo */}
      {showCatalogModal && (
        <Modal onClose={() => setShowCatalogModal(false)} title="Catálogo de Descripciones">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del Gasto</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={catalogModalProduct}
                onChange={(e) => setCatalogModalProduct(e.target.value)}
              >
                <option value="">— Selecciona —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogModalProduct && catalogModalDescs.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3 text-gray-500">Sin descripciones registradas.</td>
                    </tr>
                  ) : (
                    catalogModalDescs.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-2 py-2">{d.text}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => setShowCatalogModal(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Registrar nueva Descripción */}
      {showRegisterModal && (
        <Modal onClose={() => setShowRegisterModal(false)} title="Registrar Descripción">
          <form onSubmit={submitRegister} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del Gasto</label>
              <select
                className="w-full border rounded px-2 py-1"
                value={registerForm.product}
                onChange={(e) => setRegisterForm((f) => ({ ...f, product: e.target.value }))}
              >
                <option value="">— Selecciona —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
              <input
                type="text"
                className="w-full border rounded px-2 py-1"
                value={registerForm.text}
                onChange={(e) => setRegisterForm((f) => ({ ...f, text: e.target.value }))}
                placeholder="Escribe la nueva descripción"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => setShowRegisterModal(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyRegister}
                className={`px-3 py-1 rounded text-white ${busyRegister ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"}`}
              >
                {busyRegister ? "Registrando..." : "Registrar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────────────── helpers ───────────────────────────────── */
function numOrNull(v) {
  if (v === "" || v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function labelFrom(list, id, getLabel = (r) => r.name ?? r.description ?? String(r.id)) {
  const row = (list || []).find((x) => String(x.id) === String(id));
  return row ? getLabel(row) : "";
}

function SelectField({ label, value, onChange, options, getId, getLabel, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select
        className="w-full border rounded px-2 py-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{`— ${placeholder} —`}</option>
        {(options || []).map((opt) => {
          const id = getId(opt);
          const text = getLabel(opt);
          return (
            <option key={id} value={id}>
              {text}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-lg w-full max-w-2xl p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
