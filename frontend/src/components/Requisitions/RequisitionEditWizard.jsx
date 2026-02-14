// frontend/src/components/Requisitions/RequisitionEditWizard.jsx
import React, { useEffect, useMemo, useState } from "react";
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
  funding_source: ["/catalogs/funding-sources/", "/catalogs/funding_sources/", "/catalogs/funding/"],
  budget_unit: ["/catalogs/budget-units/", "/catalogs/budget_units/"],
  agreement: ["/catalogs/agreements/"],
  category: ["/catalogs/categories/"],
  tender: ["/catalogs/tenders/"],
  external_service: ["/catalogs/external-services/", "/catalogs/external_services/", "/catalogs/services/"],
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

/* ───────────────────────────── Estatus helpers ───────────────────────────── */
const STATUS_OPTIONS = [
  { value: "pending", label: "Pendiente" },
  { value: "approved", label: "Aprobado" },
  { value: "registered", label: "Registrado" },
  { value: "completed", label: "Completado" },
  { value: "sent", label: "Enviado a Unidad Central" },
  { value: "received", label: "Recibido por Oficina de Administración" },
  { value: "cancelled", label: "Cancelado" },
];

const STATUS_LABEL = new Map(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const displayStatus = (val) =>
  STATUS_LABEL.get(String(val || "").trim().toLowerCase()) ?? (val || "—");

/* ───────────────────────────── Helpers ───────────────────────────── */
function numOrNull(v) {
  if (v === "" || v === null || typeof v === "undefined") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function labelFrom(list, id, getLabel = (r) => r.name ?? r.description ?? String(r.id)) {
  const row = (list || []).find((x) => String(x.id) === String(id));
  return row ? getLabel(row) : "";
}

function fmtMoney(v) {
  if (v === null || typeof v === "undefined" || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(2);
}

function fmtDateTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-MX");
  } catch {
    return String(iso);
  }
}

function SelectField({ label, value, onChange, options, getId, getLabel, placeholder }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <select className="w-full border rounded px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)}>
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
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-lg w-full max-w-2xl p-4 md:p-6 z-[10000]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button type="button" className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ───────────────────────── Admin detection (robusto) ─────────────────────── */
const ME_CANDIDATES = ["/users/me/", "/users/profile/", "/auth/me/", "/me/"];

async function fetchMeFirstOk() {
  for (const u of ME_CANDIDATES) {
    try {
      const resp = await apiClient.get(u);
      if (resp?.data) return resp.data;
    } catch (e) {
      // silencio; probamos el siguiente
    }
  }
  return null;
}

function isAdminLike(me) {
  if (!me) return false;
  const role = String(me.role || "").toLowerCase();
  return Boolean(me.is_superuser || me.is_staff || role === "admin" || role === "superuser");
}

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
    status: "registered",
  });

  // ✅ checkbox para permitir imprimir/exportar
  const [ackCostRealistic, setAckCostRealistic] = useState(false);

  const [catalogs, setCatalogs] = useState({});
  const [loadingStep1, setLoadingStep1] = useState(false);

  /* ───────────────────────── Admin: monto real ───────────────────────────── */
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(false);

  const adminLike = useMemo(() => isAdminLike(me), [me]);

  const [realAmount, setRealAmount] = useState("");
  const [realAmountReason, setRealAmountReason] = useState("");
  const [busyRealAmount, setBusyRealAmount] = useState(false);
  const [realAmountLogs, setRealAmountLogs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    async function loadMe() {
      setLoadingMe(true);
      try {
        const data = await fetchMeFirstOk();
        if (!cancelled) setMe(data);
      } finally {
        if (!cancelled) setLoadingMe(false);
      }
    }
    loadMe();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requisition) return;

    const createdISO = requisition.created_at ? new Date(requisition.created_at) : null;
    const yyyyMMdd = createdISO
      ? `${createdISO.getFullYear()}-${String(createdISO.getMonth() + 1).padStart(2, "0")}-${String(
          createdISO.getDate()
        ).padStart(2, "0")}`
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
      status: requisition.status || "registered",
    }));

    setAckCostRealistic(Boolean(requisition.ack_cost_realistic));

    // Admin: init real amount + logs si vienen
    setRealAmount(
      requisition.real_amount === null || typeof requisition.real_amount === "undefined" ? "" : String(requisition.real_amount)
    );
    setRealAmountLogs(Array.isArray(requisition.real_amount_logs) ? requisition.real_amount_logs : []);
  }, [requisition]);

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoadingStep1(true);
      try {
        const keys = Object.keys(CATALOG_CANDIDATES);
        const results = await Promise.allSettled(keys.map((k) => fetchFirstOk(CATALOG_CANDIDATES[k])));
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
    return () => {
      cancelled = true;
    };
  }, []);

  const onChangeHeader = (key, value) => setHeaderForm((f) => ({ ...f, [key]: value }));

  /* ───────────────────────── Step 2: items & notes ───────────────────────── */
  const [items, setItems] = useState([]);
  const [observations, setObservations] = useState("");

  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [descOptions, setDescOptions] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  const [form, setForm] = useState({
    _cid: null, // id local para UI (si el item no existe en backend)
    id: null, // id real del backend (si existe)
    product: "",
    quantity: "",
    unit: "",
    description: "",
    estimated_unit_cost: "", // opcional
    estimated_total: "", // requerido (si no se puede calcular)
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
        _cid: String(it.id), // key UI estable
        id: it.id,
        product: coerceId(it.product),
        quantity: Number(it.quantity ?? 0),
        unit: coerceId(it.unit),
        description: coerceId(it.description),
        estimated_unit_cost:
          it.estimated_unit_cost === null || typeof it.estimated_unit_cost === "undefined" ? "" : Number(it.estimated_unit_cost),
        estimated_total: it.estimated_total === null || typeof it.estimated_total === "undefined" ? "" : Number(it.estimated_total),
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
        const [prods, ums] = await Promise.all([apiClient.get(STEP2_SPECS.productsUrl), apiClient.get(STEP2_SPECS.unitsUrl)]);
        if (!cancelled) {
          setProducts(prods.data || []);
          setUnits(ums.data || []);
        }
      } finally {
        if (!cancelled) setLoadingCatalogs(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
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
    return () => {
      cancelled = true;
    };
  }, [form.product]);

  const goNext = () => setStep((s) => Math.min(2, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  // ✅ Auto-cálculo: si hay qty + unit_cost, llenamos total
  const autoFillTotalIfPossible = (next) => {
    const qty = Number(next.quantity);
    const uc = Number(next.estimated_unit_cost);
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(uc) && uc > 0) {
      const total = Number((qty * uc).toFixed(2));
      return { ...next, estimated_total: total };
    }
    return next;
  };

  const setFormPatched = (patch) => {
    setForm((prev) => autoFillTotalIfPossible({ ...prev, ...patch }));
  };

  const addOrUpdateItem = (e) => {
    e.preventDefault();

    const { _cid, id, product, quantity, unit, description, estimated_unit_cost, estimated_total } = form;

    if (!product || !quantity || !unit || !description) {
      alert("Completa Objeto del Gasto, Cantidad, Unidad y Descripción.");
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Cantidad debe ser mayor a 0.");
      return;
    }

    const totalNum = Number(estimated_total);
    if (!Number.isFinite(totalNum) || totalNum <= 0) {
      alert("El Monto estimado (total) debe ser mayor a 0.");
      return;
    }

    const unitCostNum = estimated_unit_cost === "" ? "" : Number(estimated_unit_cost);
    if (unitCostNum !== "" && (!Number.isFinite(unitCostNum) || unitCostNum <= 0)) {
      alert("El Costo unitario estimado debe ser mayor a 0 (o déjalo vacío).");
      return;
    }

    const normalized = {
      _cid: _cid || `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      id: id ?? undefined,
      product: Number(product),
      quantity: qty,
      unit: Number(unit),
      description: Number(description),
      estimated_unit_cost: unitCostNum === "" ? undefined : Number(unitCostNum.toFixed(2)),
      estimated_total: Number(totalNum.toFixed(2)),
    };

    if (_cid) {
      setItems((prev) => prev.map((row) => (row._cid === _cid ? normalized : row)));
    } else {
      setItems((prev) => [...prev, normalized]);
    }

    setForm({
      _cid: null,
      id: null,
      product: "",
      quantity: "",
      unit: "",
      description: "",
      estimated_unit_cost: "",
      estimated_total: "",
    });
  };

  const editRow = (row) => {
    setForm({
      _cid: row._cid,
      id: row.id ?? null,
      product: String(row.product || ""),
      quantity: String(row.quantity || ""),
      unit: String(row.unit || ""),
      description: String(row.description || ""),
      estimated_unit_cost: row.estimated_unit_cost === "" ? "" : String(row.estimated_unit_cost ?? ""),
      estimated_total: row.estimated_total === "" ? "" : String(row.estimated_total ?? ""),
    });
    if (step !== 2) setStep(2);
  };

  const deleteRow = (_cid) => {
    if (!window.confirm("¿Eliminar este artículo?")) return;
    setItems((prev) => prev.filter((r) => r._cid !== _cid));
  };

  const openClassifier = () => {
    console.log("[Wizard] openClassifier()");
    window.open("/docs/clasificador.pdf", "_blank", "noopener");
  };

  /* ──────────────── “Ver Catálogo” modal behaviors ──────────────────────── */
  const openCatalogModal = () => {
    console.log("[Wizard] openCatalogModal()");
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
        const resp = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(catalogModalProduct));
        if (!cancelled) setCatalogModalDescs(resp.data || []);
      } catch (e) {
        if (!cancelled) setCatalogModalDescs([]);
      }
    }
    fetchDescs();
    return () => {
      cancelled = true;
    };
  }, [showCatalogModal, catalogModalProduct]);

  /* ───────────────── “Registrar” (nuevo ItemDescription) ─────────────────── */
  const openRegisterModal = () => {
    console.log("[Wizard] openRegisterModal()");
    setRegisterForm({ product: form.product || "", text: "" });
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
      const payload = { product: Number(registerForm.product), text: registerForm.text.trim() };
      const resp = await apiClient.post(STEP2_SPECS.itemDescriptionsPostUrl, payload);

      // Refresh description lists when relevant
      if (String(form.product) === String(registerForm.product)) {
        try {
          const refresh = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(form.product));
          setDescOptions(refresh.data || []);
        } catch {}
      }
      if (String(catalogModalProduct) === String(registerForm.product)) {
        try {
          const refresh = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(catalogModalProduct));
          setCatalogModalDescs(refresh.data || []);
        } catch {}
      }

      // Preselect the new description
      setFormPatched({
        product: String(registerForm.product),
        description: String(resp.data?.id ?? ""),
      });

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
      const cleanItems = items.map(({ _cid, ...rest }) => {
        const out = { ...rest };
        if (!out.id) delete out.id;
        return out;
      });

      const payload = {
        requesting_department: numOrNull(headerForm.requesting_department),
        project: numOrNull(headerForm.project),
        funding_source: numOrNull(headerForm.funding_source),
        budget_unit: numOrNull(headerForm.budget_unit),
        agreement: numOrNull(headerForm.agreement),
        category: numOrNull(headerForm.category),
        tender: numOrNull(headerForm.tender),
        external_service: numOrNull(headerForm.external_service),

        requisition_reason: headerForm.requisition_reason ?? "",
        observations,

        ack_cost_realistic: ackCostRealistic,

        items: cleanItems,
        status: headerForm.status,
      };

      const resp = await apiClient.put(`/requisitions/${requisition.id}/`, payload);
      onSaved?.(resp.data);
      alert(`Requisición #${requisition.id} guardada correctamente.`);
    } catch (err) {
      console.error(err);
      const data = err?.response?.data;
      if (data) {
        alert(`No se pudo guardar.\n\n${JSON.stringify(data, null, 2)}`);
      } else {
        alert("No se pudo guardar. Revisa los datos.");
      }
    } finally {
      setBusySave(false);
    }
  };

  /* ───────────────────── Admin: guardar monto real ───────────────────────── */
  const saveRealAmount = async () => {
    if (!adminLike) {
      alert("Solo administradores pueden capturar el monto real.");
      return;
    }

    const amountNum = Number(realAmount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      alert("Monto real debe ser mayor a 0.");
      return;
    }

    if (!realAmountReason.trim()) {
      alert("Escribe el motivo del cambio (obligatorio).");
      return;
    }

    setBusyRealAmount(true);
    try {
      await apiClient.post(`/requisitions/${requisition.id}/set_real_amount/`, {
        real_amount: realAmount,
        reason: realAmountReason.trim(),
      });

      // Intentar refrescar datos (incluye logs)
      try {
        const refreshed = await apiClient.get(`/requisitions/${requisition.id}/`);
        const data = refreshed.data;
        setRealAmount(
          data.real_amount === null || typeof data.real_amount === "undefined" ? "" : String(data.real_amount)
        );
        setRealAmountLogs(Array.isArray(data.real_amount_logs) ? data.real_amount_logs : []);
        onSaved?.(data);
      } catch {
        // Si no podemos refrescar, al menos avisamos
      }

      setRealAmountReason("");
      alert("Monto real guardado con auditoría.");
    } catch (e) {
      const data = e?.response?.data;
      alert(`No se pudo guardar monto real.\n\n${JSON.stringify(data || {}, null, 2)}`);
    } finally {
      setBusyRealAmount(false);
    }
  };

  if (!requisition) return <LoadingSpinner />;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Banner */}
      <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded mb-4">
        <strong>Editar Requisición #{requisition.id}</strong>
        <div className="text-sm">Estatus actual: {displayStatus(requisition.status)}</div>
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

      {/* STEP 1 */}
      {step === 1 && (
        <section className="bg-white rounded-xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Información general</h2>

          {loadingStep1 ? (
            <LoadingSpinner />
          ) : (
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              {Object.keys(CATALOG_META)
                .filter((key) => key !== "administrative_unit")
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

              {/* Estatus */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Estatus</label>
                <select
                  className="w-full border rounded px-2 py-1"
                  value={headerForm.status}
                  onChange={(e) => onChangeHeader("status", e.target.value)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Fecha de creación (read-only) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha de creación</label>
                <div className="px-2 py-1 border rounded bg-gray-100 text-gray-700">{headerForm.created_at || "—"}</div>
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

              {/* Monto real (solo lectura para no-admin; útil para todos) */}
              <div className="md:col-span-2 border rounded p-3 bg-gray-50">
                <div className="text-sm">
                  <strong>Monto real</strong>: {fmtMoney(requisition.real_amount)}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  {loadingMe ? "Verificando permisos..." : adminLike ? "Admins pueden capturarlo en Paso 2." : "Solo admins pueden capturarlo."}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                goNext();
              }}
              className="inline-flex items-center px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              Siguiente
            </button>
          </div>
        </section>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <section className="bg-white rounded-xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-4">Registro de Partidas</h2>

          {loadingCatalogs ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* Inline editor */}
              <form onSubmit={addOrUpdateItem} className="grid md:grid-cols-6 gap-3">
                {/* Objeto del Gasto */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del Gasto</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.product}
                    onChange={(e) => setFormPatched({ product: e.target.value, description: "" })}
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
                    onChange={(e) => setFormPatched({ quantity: e.target.value })}
                  />
                </div>

                {/* Unidad */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unidad</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.unit}
                    onChange={(e) => setFormPatched({ unit: e.target.value })}
                  >
                    <option value="">— Selecciona —</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Costo unitario (opcional) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Costo unitario (opcional)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border rounded px-2 py-1"
                    value={form.estimated_unit_cost}
                    onChange={(e) => setFormPatched({ estimated_unit_cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                {/* Monto estimado total (requerido) */}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto estimado (total)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border rounded px-2 py-1"
                    value={form.estimated_total}
                    onChange={(e) => setFormPatched({ estimated_total: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                {/* Descripción */}
                <div className="md:col-span-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.description}
                    onChange={(e) => setFormPatched({ description: e.target.value })}
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

                {/* Action row */}
                <div className="md:col-span-2 flex items-end gap-2">
                  <button type="submit" className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700">
                    {form._cid ? "Guardar cambios" : "Agregar"}
                  </button>

                  {form._cid && (
                    <button
                      type="button"
                      className="px-3 py-2 rounded bg-gray-200 hover:bg-gray-300"
                      onClick={() =>
                        setForm({
                          _cid: null,
                          id: null,
                          product: "",
                          quantity: "",
                          unit: "",
                          description: "",
                          estimated_unit_cost: "",
                          estimated_total: "",
                        })
                      }
                    >
                      Cancelar
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("CLICK: Clasificador (Wizard)");
                        openClassifier();
                      }}
                      className="px-3 py-2 rounded bg-slate-200 hover:bg-slate-300"
                    >
                      Clasificador
                    </button>

                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("CLICK: Ver Catálogo");
                        openCatalogModal();
                      }}
                      className="px-3 py-2 rounded bg-slate-200 hover:bg-slate-300"
                    >
                      Ver Catálogo
                    </button>

                    <button
                      type="button"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log("CLICK: Registrar");
                        openRegisterModal();
                      }}
                      className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
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
                        <th className="px-2 py-2 text-center">Unitario</th>
                        <th className="px-2 py-2 text-center">Total</th>
                        <th className="px-2 py-2 text-left">Descripción (ID)</th>
                        <th className="px-2 py-2 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td className="px-2 py-3 text-center text-gray-500" colSpan={7}>
                            Aún no has agregado partidas.
                          </td>
                        </tr>
                      ) : (
                        items.map((row, idx) => (
                          <tr key={row._cid ?? `tmp-${idx}`} className="border-t">
                            <td className="px-2 py-2">{labelFrom(products, row.product, (r) => r.description)}</td>
                            <td className="px-2 py-2 text-center">{row.quantity}</td>
                            <td className="px-2 py-2 text-center">{labelFrom(units, row.unit, (r) => r.name)}</td>
                            <td className="px-2 py-2 text-center">
                              {row.estimated_unit_cost === "" ? "—" : Number(row.estimated_unit_cost).toFixed(2)}
                            </td>
                            <td className="px-2 py-2 text-center">
                              {row.estimated_total === "" ? "—" : Number(row.estimated_total).toFixed(2)}
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
                                  onClick={() => deleteRow(row._cid)}
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

              {/* ✅ Checkbox ack_cost_realistic */}
              <div className="mt-6 border rounded p-3 bg-gray-50">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={ackCostRealistic} onChange={(e) => setAckCostRealistic(e.target.checked)} />
                  <span className="text-sm">
                    Confirmo que el <strong>costo aproximado pero realista</strong> ha sido verificado (requisito para
                    imprimir/exportar PDF).
                  </span>
                </label>
              </div>

              {/* ✅ Admin: Monto real + auditoría */}
              <div className="mt-6 border rounded p-4 bg-amber-50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Admin — Capturar monto real</h3>
                  <div className="text-xs text-gray-600">
                    Monto actual: <strong>{fmtMoney(requisition.real_amount)}</strong>
                  </div>
                </div>

                {!adminLike ? (
                  <p className="text-sm text-gray-700 mt-2">
                    Solo administradores pueden capturar/editar el monto real.
                  </p>
                ) : (
                  <div className="grid md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Monto real</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border rounded px-2 py-1"
                        value={realAmount}
                        onChange={(e) => setRealAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Motivo del cambio (obligatorio)</label>
                      <input
                        type="text"
                        className="w-full border rounded px-2 py-1"
                        value={realAmountReason}
                        onChange={(e) => setRealAmountReason(e.target.value)}
                        placeholder="Ej. Unidad Central confirmó factura / ajuste final / pagado"
                      />
                    </div>

                    <div className="md:col-span-3 flex justify-end">
                      <button
                        type="button"
                        disabled={busyRealAmount}
                        onClick={saveRealAmount}
                        className={`px-4 py-2 rounded text-white ${
                          busyRealAmount ? "bg-amber-300" : "bg-amber-600 hover:bg-amber-700"
                        }`}
                      >
                        {busyRealAmount ? "Guardando..." : "Guardar monto real (con auditoría)"}
                      </button>
                    </div>

                    {/* Historial */}
                    <div className="md:col-span-3">
                      <h4 className="text-xs font-semibold text-gray-700 mt-2 mb-2">Historial de cambios</h4>

                      {realAmountLogs.length === 0 ? (
                        <div className="text-sm text-gray-600">Aún no hay cambios registrados.</div>
                      ) : (
                        <div className="border rounded bg-white overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 text-left">Cuándo</th>
                                <th className="px-2 py-2 text-left">Quién</th>
                                <th className="px-2 py-2 text-center">Antes</th>
                                <th className="px-2 py-2 text-center">Después</th>
                                <th className="px-2 py-2 text-left">Por qué</th>
                              </tr>
                            </thead>
                            <tbody>
                              {realAmountLogs.map((l) => (
                                <tr key={l.id} className="border-t">
                                  <td className="px-2 py-2">{fmtDateTime(l.changed_at)}</td>
                                  <td className="px-2 py-2">{l.changed_by_email || l.changed_by || "—"}</td>
                                  <td className="px-2 py-2 text-center">{fmtMoney(l.old_value)}</td>
                                  <td className="px-2 py-2 text-center">{fmtMoney(l.new_value)}</td>
                                  <td className="px-2 py-2">{l.reason || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                <button type="button" onClick={goPrev} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={busySave}
                  onClick={saveAll}
                  className={`px-4 py-2 rounded text-white ${
                    busySave ? "bg-green-400" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {busySave ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ───────────── Modals ───────────── */}
      {showCatalogModal && (
        <Modal onClose={() => setShowCatalogModal(false)} title="Catálogo de Descripciones (Wizard)">
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

      {showRegisterModal && (
        <Modal onClose={() => setShowRegisterModal(false)} title="Registrar Descripción (Wizard)">
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
                className={`px-3 py-1 rounded text-white ${
                  busyRegister ? "bg-blue-400" : "bg-blue-600 hover:bg-blue-700"
                }`}
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
