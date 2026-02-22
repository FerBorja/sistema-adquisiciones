// frontend/src/components/Requisitions/RequisitionEditWizard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../api/apiClient";
import LoadingSpinner from "../UI/LoadingSpinner";
import RequisitionQuotesPanel from "./RequisitionQuotesPanel";

/* ✅ Ruta a la lista (ajústala si tu app usa otra) */
const LIST_ROUTE = "/requisitions";

/* [LICIT] Alta de nuevos productos deshabilitada en UI (solo vía Django admin) */
const SHOW_REGISTER_PRODUCT_BUTTON = false;

/* ────────────────────────────────────────────────────────────────────────────
   Step 1 catalog endpoints: try múltiples candidatos hasta que uno funcione.
   NOTE: administrative_unit NO es catálogo (es CharField editable=False en backend),
   así que no debe pedirse aquí.
---------------------------------------------------------------------------- */
const CATALOG_CANDIDATES = {
  requesting_department: [
    "/catalogs/departments/",
    "/catalogs/requesting-departments/",
    "/catalogs/requesting_departments/",
  ],
  project: ["/catalogs/projects/"],
  funding_source: ["/catalogs/funding-sources/", "/catalogs/funding_sources/", "/catalogs/funding/"],
  budget_unit: ["/catalogs/budget-units/", "/catalogs/budget_units/"],
  agreement: ["/catalogs/agreements/"],
  tender: ["/catalogs/tenders/"],
  external_service: ["/catalogs/external-services/", "/catalogs/external_services/", "/catalogs/services/"],
};

const CATALOG_META = {
  requesting_department: { uiLabel: "Departamento Solicitante" },
  project: { uiLabel: "Proyecto" },
  funding_source: { uiLabel: "Fuente de Financiamiento" },
  budget_unit: { uiLabel: "Unidad Presupuestal" },
  agreement: { uiLabel: "Convenios" },
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
  // ✅ IMPORTANT: con slash final para DRF
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

/** ✅ Sumar estimated_total (sirve para sugerir monto real inicial) */
function sumEstimatedTotals(itemsList) {
  return (itemsList || []).reduce((acc, it) => {
    const n = Number(it?.estimated_total);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

/** ✅ FRONT-SOLN punto 1: obtener texto de descripción desde cache por producto */
function getDescTextFromCache(descCache, productId, descId) {
  const list = descCache?.[String(productId)] || [];
  const found = list.find((d) => String(d.id) === String(descId));
  return found?.text || "";
}

/** ✅ Prefer backend bonito si existe; si no, usa cache/fallback; soporta manual_description */
function getNiceDescDisplay({ row, descCache }) {
  if (row?.description_display) return row.description_display;

  // Si backend manda description_text:
  if (row?.description_text) {
    // si hay id de descripción, muéstralo con ID
    if (row?.description) return `${row.description_text} (ID: ${row.description})`;
    // si no hay id (manual), solo texto
    return row.description_text;
  }

  // Manual fallback
  if (row?.manual_description) return String(row.manual_description);

  // Cache fallback (catálogo)
  const txt = getDescTextFromCache(descCache, row?.product, row?.description);
  if (txt) return `${txt} (ID: ${row.description})`;

  return row?.description ? `ID: ${row.description}` : "";
}

/** ✅ Warning reusable: solo para modo manual (NO APLICA) */
function ManualUomWarning({ unitLabel }) {
  return (
    <div
      style={{
        background: "#FFF3CD",
        border: "1px solid #FFEEBA",
        color: "#856404",
        padding: "10px 12px",
        borderRadius: 10,
        marginBottom: 12,
        lineHeight: 1.35,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        ⚠️ Importante (Licitación: NO APLICA)
      </div>
      <div>
        La <b>descripción</b> que captures debe <b>coincidir con la Unidad de Medida</b>{" "}
        (cuando aplique). Si cambias la unidad, revisa y ajusta la descripción para que
        sea consistente.
      </div>

      {unitLabel ? (
        <div style={{ marginTop: 6, fontSize: 13 }}>
          Unidad seleccionada: <b>{unitLabel}</b>
        </div>
      ) : null}
    </div>
  );
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
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    } catch {
      // silencio
    }
  }
  return null;
}

function isAdminLike(me) {
  if (!me) return false;
  const role = String(me.role || "").toLowerCase();
  return Boolean(me.is_superuser || me.is_staff || role === "admin" || role === "superuser");
}

/** ✅ helper: id real para backend */
function isRealId(v) {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

/* ✅ A) helper único: wrapper de guardado con chequeo de duplicados (409) */
async function saveWithDuplicateCheck({ reqId, payload, method = "put" }) {
  try {
    const url = `/requisitions/${reqId}/`;
    const res =
      method === "patch"
        ? await apiClient.patch(url, payload)
        : await apiClient.put(url, payload);

    return { ok: true, data: res.data };
  } catch (err) {
    const httpStatus = err?.response?.status;
    const data = err?.response?.data;

    if (httpStatus === 409 && Array.isArray(data?.duplicates) && data.duplicates.length > 0) {
      const lines = data.duplicates.slice(0, 8).map((d) => {
        const when = d.date ? new Date(d.date).toLocaleString("es-MX") : "";
        const pct = Number(d.match_ratio ?? 0) * 100;
        return `• #${d.id} — ${when} — match ${pct.toFixed(0)}% (${d.match_count} item(s))`;
      });

      const msg =
        `⚠️ Posible duplicado detectado (ventana ${data.window_days} días).\n\n` +
        lines.join("\n") +
        `\n\n¿Quieres ENVIAR / GUARDAR de todos modos?`;

      const userAccepted = window.confirm(msg);

      if (!userAccepted) {
        return { ok: false, cancelled: true, duplicates: data.duplicates };
      }

      const forceUrl = `/requisitions/${reqId}/?force_duplicates=1`;
      const res2 =
        method === "patch"
          ? await apiClient.patch(forceUrl, payload)
          : await apiClient.put(forceUrl, payload);

      return { ok: true, data: res2.data, forced: true, duplicates: data.duplicates };
    }

    throw err;
  }
}

export default function RequisitionEditWizard({ requisition, onSaved }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  // ✅ detectar cambios locales sin guardar
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ✅ Camino 2 rollback: IDs creados en esta sesión (solo nuevos creados aquí)
  const createdItemIdsThisSessionRef = useRef(new Set()); // Set<number>

  /* ───────────────────────── Step 1: editable header ─────────────────────── */
  const [headerForm, setHeaderForm] = useState({
    administrative_unit: "",
    requesting_department: "",
    project: "",
    funding_source: "",
    budget_unit: "",
    agreement: "",
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

  /* ───────────────────────── Step 2: items & notes ───────────────────────── */
  const [items, setItems] = useState([]);
  const [observations, setObservations] = useState("");

  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [descOptions, setDescOptions] = useState([]);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);

  // ✅ cache de descripciones por producto
  const [descCache, setDescCache] = useState({}); // { [productId]: [{id,text,estimated_unit_cost,...}] }

  const [form, setForm] = useState({
    _cid: null,
    id: null,
    product: "",
    quantity: "",
    unit: "",
    description: "",
    manual_description: "",
    estimated_unit_cost: "",
    estimated_total: "",
  });

  // Modals
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [catalogModalProduct, setCatalogModalProduct] = useState("");
  const [catalogModalDescs, setCatalogModalDescs] = useState([]);

  const [registerForm, setRegisterForm] = useState({ product: "", text: "", estimated_unit_cost: "" });
  const [busyRegister, setBusyRegister] = useState(false);

  const [busySave, setBusySave] = useState(false);

  // ✅ NUEVO: busy para operaciones de items (POST/PATCH/DELETE)
  const [busyItemOp, setBusyItemOp] = useState(false);

  /* ───────────────────────── Admin: monto real ───────────────────────────── */
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(false);

  const adminLike = useMemo(() => isAdminLike(me), [me]);

  // ✅ mantener TU comportamiento: bloquear monto real si hay draft PDF incompleto
  const [quoteDraftInvalid, setQuoteDraftInvalid] = useState(false);
  const disableRealAmountByQuoteDraft = quoteDraftInvalid;

  // ✅ estados para obligar captura de monto real tras cambios en items / inicial sin real_amount
  const [realAmountNeedsUpdate, setRealAmountNeedsUpdate] = useState(false);
  const [realAmountBase, setRealAmountBase] = useState(0);
  const [realAmountPendingDelta, setRealAmountPendingDelta] = useState(0);
  const [realAmountCaptured, setRealAmountCaptured] = useState(true);

  const [realAmountDraft, setRealAmountDraft] = useState("");
  const [realAmountReason, setRealAmountReason] = useState("");
  const [busyRealAmount, setBusyRealAmount] = useState(false);
  const [realAmountLogs, setRealAmountLogs] = useState([]);

  // ✅ Guardar requisición bloqueado si admin tiene pendiente captura
  const disableSave = adminLike && realAmountNeedsUpdate && !realAmountCaptured;

  // ✅ Guardar bloqueado si no confirmó costo aproximado realista
  const disableSaveByAck = !ackCostRealistic;

  // ✅ Monto real bloqueado si no confirmó costo aproximado realista
  const disableRealAmountByAck = !ackCostRealistic;

  const markRealAmountPending = (delta) => {
    if (!adminLike) return;
    const d = Number(delta || 0);
    if (!Number.isFinite(d) || d === 0) return;

    setRealAmountNeedsUpdate(true);
    setRealAmountCaptured(false);
    setRealAmountReason("");
    setRealAmountPendingDelta((prev) => prev + d);
  };

  // ✅ Manual mode detectado por tender label (NO APLICA)
  const manualItemsMode = useMemo(() => {
    const tenderLabel =
      labelFrom(catalogs?.tender || [], headerForm.tender, (r) => r.name ?? r.description ?? "") || "";
    return String(tenderLabel).toUpperCase().includes("NO APLICA");
  }, [catalogs, headerForm.tender]);

  // ✅ Para el warning: unidad seleccionada en el form (si ya hay)
  const currentUnitLabel = useMemo(() => {
    if (!manualItemsMode) return "";
    if (!form.unit) return "";
    return labelFrom(units, form.unit, (r) => r.name ?? r.description ?? r.code ?? String(r.id));
  }, [manualItemsMode, form.unit, units]);

  // ✅ Cancelar + Camino 2 rollback
  const handleCancelToList = async () => {
    if (busyItemOp || busySave || busyRealAmount) {
      alert("Hay una operación en curso. Espera a que termine antes de cancelar.");
      return;
    }

    // confirmación por cambios locales
    if (hasUnsavedChanges) {
      if (!window.confirm("Hay cambios sin guardar. ¿Salir de todos modos?")) return;
    } else {
      if (!window.confirm("¿Salir sin guardar cambios?")) return;
    }

    // Camino 2: si hubo items creados en esta sesión, ofrecer borrarlos
    const createdIds = Array.from(createdItemIdsThisSessionRef.current || []);
    if (createdIds.length > 0) {
      const wantRollback = window.confirm(
        `Detecté ${createdIds.length} partida(s) creada(s) en esta edición.\n\n¿Quieres eliminarlas antes de salir?`
      );

      if (wantRollback) {
        setBusyItemOp(true);
        try {
          const results = await Promise.allSettled(
            createdIds.map((id) => apiClient.delete(`/requisitions/${requisition.id}/items/${id}/`))
          );

          const failed = results
            .map((r, i) => ({ r, id: createdIds[i] }))
            .filter((x) => x.r.status === "rejected")
            .map((x) => {
              const err = x.r.reason;
              const data = err?.response?.data;
              const msg = data?.detail || (data ? JSON.stringify(data) : err?.message || "Error");
              return `ID ${x.id}: ${msg}`;
            });

          if (failed.length > 0) {
            alert(
              "Se intentó hacer rollback, pero algunas partidas no se pudieron eliminar:\n\n" + failed.join("\n")
            );
          }
        } catch (err) {
          console.error(err);
          alert("No se pudo hacer rollback de las partidas creadas. Revisa la consola.");
        } finally {
          setBusyItemOp(false);
        }
      }
    }

    navigate(LIST_ROUTE);
  };

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

  // Cargar requisición en UI
  useEffect(() => {
    if (!requisition) return;

    // ✅ reset de rollback por sesión al cambiar requisición
    createdItemIdsThisSessionRef.current = new Set();

    const createdISO = requisition.created_at ? new Date(requisition.created_at) : null;
    const yyyyMMdd = createdISO
      ? `${createdISO.getFullYear()}-${String(createdISO.getMonth() + 1).padStart(2, "0")}-${String(
          createdISO.getDate()
        ).padStart(2, "0")}`
      : "";

    setHeaderForm((prev) => ({
      ...prev,
      administrative_unit: requisition.administrative_unit || "",
      requesting_department: coerceId(requisition.requesting_department),
      project: coerceId(requisition.project),
      funding_source: coerceId(requisition.funding_source),
      budget_unit: coerceId(requisition.budget_unit),
      agreement: coerceId(requisition.agreement),
      tender: coerceId(requisition.tender),
      external_service: coerceId(requisition.external_service),
      created_at: yyyyMMdd,
      requisition_reason: requisition.requisition_reason || "",
      status: requisition.status || "registered",
    }));

    setAckCostRealistic(Boolean(requisition.ack_cost_realistic));
    setRealAmountLogs(Array.isArray(requisition.real_amount_logs) ? requisition.real_amount_logs : []);

    setItems(
      (requisition.items || []).map((it) => ({
        _cid: String(it.id),
        id: it.id,
        product: coerceId(it.product),
        quantity: Number(it.quantity ?? 0),
        unit: coerceId(it.unit),

        // ✅ manual support
        description: coerceId(it.description), // puede ser "" si null
        manual_description: it.manual_description || "",

        description_text: it.description_text || "",
        description_display: it.description_display || "",

        estimated_unit_cost:
          it.estimated_unit_cost === null || typeof it.estimated_unit_cost === "undefined"
            ? ""
            : Number(it.estimated_unit_cost),
        estimated_total:
          it.estimated_total === null || typeof it.estimated_total === "undefined" ? "" : Number(it.estimated_total),
      }))
    );

    setObservations(requisition.observations || "");

    const hasReal = requisition.real_amount !== null && typeof requisition.real_amount !== "undefined";
    const baseNum = Number(hasReal ? requisition.real_amount : 0);
    setRealAmountBase(Number.isFinite(baseNum) ? baseNum : 0);

    setRealAmountPendingDelta(0);
    setRealAmountNeedsUpdate(false);
    setRealAmountCaptured(true);

    setRealAmountDraft(!hasReal ? "" : String(requisition.real_amount));

    const itemsSum = sumEstimatedTotals(requisition.items);
    if (adminLike && !hasReal && itemsSum > 0) {
      setRealAmountBase(0);
      setRealAmountPendingDelta(itemsSum);
      setRealAmountNeedsUpdate(true);
      setRealAmountCaptured(false);
      setRealAmountReason("");
    }

    setHasUnsavedChanges(false);
  }, [requisition, adminLike]);

  // ✅ Autollenado sugerido: base + delta
  useEffect(() => {
    if (!adminLike) return;
    if (!realAmountNeedsUpdate) return;

    const suggested = Number(realAmountBase || 0) + Number(realAmountPendingDelta || 0);
    if (!Number.isFinite(suggested)) return;

    setRealAmountDraft(suggested.toFixed(2));
  }, [adminLike, realAmountNeedsUpdate, realAmountBase, realAmountPendingDelta]);

  // Cargar catálogos Step 1
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      setLoadingStep1(true);
      try {
        const keys = Object.keys(CATALOG_META);
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

  const onChangeHeader = (key, value) => {
    setHeaderForm((f) => ({ ...f, [key]: value }));
    setHasUnsavedChanges(true);
  };

  // Cargar catálogos Step 2 cuando se entra al paso 2
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
    return () => {
      cancelled = true;
    };
  }, [step]);

  // ✅ al cambiar producto del formulario: cargar descOptions y cachearlas (solo si NO es manual)
  useEffect(() => {
    if (manualItemsMode) {
      setDescOptions([]);
      return;
    }

    const pid = form.product;
    if (!pid) {
      setDescOptions([]);
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        const resp = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(pid));
        const list = resp.data || [];
        if (!cancelled) {
          setDescOptions(list);
          setDescCache((prev) => ({ ...prev, [String(pid)]: list }));
        }
      } catch {
        if (!cancelled) setDescOptions([]);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [form.product, manualItemsMode]);

  // ✅ precargar descripciones para TODOS los productos que estén en items (solo si NO es manual)
  useEffect(() => {
    if (manualItemsMode) return;
    if (step !== 2) return;

    const productIds = Array.from(new Set((items || []).map((it) => String(it.product)).filter(Boolean)));
    const missing = productIds.filter((pid) => !descCache?.[pid]);
    if (missing.length === 0) return;

    let cancelled = false;
    async function prefetch() {
      try {
        const results = await Promise.allSettled(
          missing.map((pid) => apiClient.get(STEP2_SPECS.itemDescriptionsUrl(pid)))
        );
        if (cancelled) return;

        const patch = {};
        results.forEach((res, i) => {
          const pid = missing[i];
          if (res.status === "fulfilled") patch[String(pid)] = res.value?.data || [];
        });

        if (Object.keys(patch).length) {
          setDescCache((prev) => ({ ...prev, ...patch }));
        }
      } catch {
        // silencio
      }
    }
    prefetch();
    return () => {
      cancelled = true;
    };
  }, [step, items, descCache, manualItemsMode]);

  const goNext = () => setStep((s) => Math.min(2, s + 1));
  const goPrev = () => setStep((s) => Math.max(1, s - 1));

  // ✅ Auto-cálculo: cantidad × unit_cost
  const autoFillTotalIfPossible = (next) => {
    const qty = Number(next.quantity);
    const uc = Number(next.estimated_unit_cost);
    if (Number.isFinite(qty) && qty > 0 && Number.isFinite(uc) && uc > 0) {
      const total = (qty * uc).toFixed(2);
      return { ...next, estimated_total: total };
    }
    return { ...next, estimated_total: "" };
  };

  const setFormPatched = (patch) => {
    setForm((prev) => autoFillTotalIfPossible({ ...prev, ...patch }));
  };

  // ✅ Handler para descripción de catálogo: setea costo del catálogo + recalcula total
  const handleDescriptionChange = (descId) => {
    if (manualItemsMode) return;

    const selected = (descOptions || []).find((d) => String(d.id) === String(descId));
    const cost = selected?.estimated_unit_cost;

    setFormPatched({
      description: descId,
      estimated_unit_cost: cost !== null && typeof cost !== "undefined" && cost !== "" ? String(cost) : "",
    });
  };

  // ✅ Refuerzo: si ya hay descripción y llegan descOptions, sincronizamos costo con catálogo
  useEffect(() => {
    if (manualItemsMode) return;

    const did = form.description;
    if (!did) return;

    const selected = (descOptions || []).find((d) => String(d.id) === String(did));
    if (!selected) return;

    const catCost = selected.estimated_unit_cost;
    if (catCost === null || typeof catCost === "undefined" || catCost === "") return;

    const nextStr = String(catCost);
    setForm((prev) => {
      if (String(prev.estimated_unit_cost) === nextStr) {
        return autoFillTotalIfPossible(prev);
      }
      return autoFillTotalIfPossible({ ...prev, estimated_unit_cost: nextStr });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.description, descOptions, manualItemsMode]);

  // ✅ B) addOrUpdateItem → POST/PATCH a items anidados (soporta manual)
  const addOrUpdateItem = async (e) => {
    e.preventDefault();

    const {
      id,
      product,
      quantity,
      unit,
      description,
      manual_description,
      estimated_unit_cost,
    } = form;

    // Validación base
    if (!product || !quantity || !unit) {
      alert("Completa Objeto del Gasto, Cantidad y Unidad.");
      return;
    }

    if (!manualItemsMode && !description) {
      alert("Completa Descripción (catálogo).");
      return;
    }

    if (manualItemsMode && !String(manual_description || "").trim()) {
      alert("Completa Descripción (manual).");
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      alert("Cantidad debe ser mayor a 0.");
      return;
    }

    const unitCostNum = Number(estimated_unit_cost);
    if (!Number.isFinite(unitCostNum) || unitCostNum <= 0) {
      alert(
        manualItemsMode
          ? "El Costo unitario es obligatorio y debe ser mayor a 0."
          : "El Costo unitario (desde catálogo) es obligatorio y debe ser mayor a 0."
      );
      return;
    }

    const totalNum = Number((qty * unitCostNum).toFixed(2));

    // payload limpio
    const payload = {
      product: Number(product),
      quantity: qty,
      unit: Number(unit),
      estimated_unit_cost: Number(unitCostNum.toFixed(2)),
      estimated_total: totalNum,

      ...(manualItemsMode
        ? {
            description: null,
            manual_description: String(manual_description || "").trim(),
          }
        : {
            description: Number(description),
            manual_description: null,
          }),
    };

    // UI local
    let descTextLocal = "";
    let descDisplayLocal = "";

    if (manualItemsMode) {
      descTextLocal = String(manual_description || "").trim();
      descDisplayLocal = descTextLocal;
    } else {
      const selected = (descOptions || []).find((d) => String(d.id) === String(description));
      descTextLocal =
        selected?.text || getDescTextFromCache(descCache, Number(product), Number(description)) || "";
      descDisplayLocal = descTextLocal
        ? `${descTextLocal} (ID: ${Number(description)})`
        : `ID: ${Number(description)}`;
    }

    setBusyItemOp(true);
    try {
      if (isRealId(id)) {
        // ✅ PATCH existente
        const res = await apiClient.patch(`/requisitions/${requisition.id}/items/${Number(id)}/`, payload);
        const updated = res.data;

        // delta real amount (solo admin)
        if (adminLike) {
          const oldRow = (items || []).find((r) => Number(r.id) === Number(id));
          const oldTotal = Number(oldRow?.estimated_total);
          const oldTotalSafe = Number.isFinite(oldTotal) ? oldTotal : 0;
          const delta = Number((totalNum - oldTotalSafe).toFixed(2));
          if (delta !== 0) markRealAmountPending(delta);
        }

        setItems((prev) =>
          prev.map((row) =>
            Number(row.id) === Number(updated.id)
              ? {
                  ...row,
                  _cid: String(updated.id),
                  id: updated.id,
                  ...payload,

                  // refrescar campos de texto si vienen del backend
                  manual_description: updated.manual_description ?? payload.manual_description ?? "",
                  description_text: updated.description_text || descTextLocal,
                  description_display: updated.description_display || descDisplayLocal,
                }
              : row
          )
        );
      } else {
        // ✅ POST nuevo: regresa ID
        const res = await apiClient.post(`/requisitions/${requisition.id}/items/`, payload);
        const created = res.data;

        // registrar ID para rollback sesión
        if (isRealId(created?.id)) {
          createdItemIdsThisSessionRef.current.add(Number(created.id));
        }

        if (adminLike) {
          markRealAmountPending(totalNum);
        }

        setItems((prev) => [
          ...prev,
          {
            _cid: String(created.id),
            id: created.id,
            ...payload,

            manual_description: created.manual_description ?? payload.manual_description ?? "",
            description_text: created.description_text || descTextLocal,
            description_display: created.description_display || descDisplayLocal,
          },
        ]);
      }

      setHasUnsavedChanges(true);

      // limpia form
      setForm({
        _cid: null,
        id: null,
        product: "",
        quantity: "",
        unit: "",
        description: "",
        manual_description: "",
        estimated_unit_cost: "",
        estimated_total: "",
      });
    } catch (err) {
      console.error(err);
      const data = err?.response?.data;
      alert(`No se pudo guardar la partida.\n\n${data ? JSON.stringify(data, null, 2) : err?.message || ""}`);
    } finally {
      setBusyItemOp(false);
    }
  };

  const editRow = (row) => {
    setForm((prev) =>
      autoFillTotalIfPossible({
        ...prev,
        _cid: row._cid,
        id: row.id ?? null,
        product: String(row.product || ""),
        quantity: String(row.quantity || ""),
        unit: String(row.unit || ""),
        description: String(row.description || ""),
        manual_description: String(row.manual_description || ""),
        estimated_unit_cost: row.estimated_unit_cost === "" ? "" : String(row.estimated_unit_cost ?? ""),
        estimated_total: row.estimated_total === "" ? "" : String(row.estimated_total ?? ""),
      })
    );
    if (step !== 2) setStep(2);
  };

  // ✅ C) deleteRow → DELETE real si tiene id
  const deleteRow = async (_cid) => {
    if (!window.confirm("¿Eliminar este artículo?")) return;

    const row = (items || []).find((r) => String(r._cid) === String(_cid));
    const realId = row?.id;

    setBusyItemOp(true);
    try {
      if (isRealId(realId)) {
        await apiClient.delete(`/requisitions/${requisition.id}/items/${Number(realId)}/`);
        createdItemIdsThisSessionRef.current.delete(Number(realId));
      }

      // delta real amount (solo admin)
      if (adminLike) {
        const oldTotal = Number(row?.estimated_total);
        const oldTotalSafe = Number.isFinite(oldTotal) ? oldTotal : 0;
        if (oldTotalSafe !== 0) markRealAmountPending(-oldTotalSafe);
      }

      setItems((prev) => prev.filter((r) => r._cid !== _cid));
      setHasUnsavedChanges(true);

      if (String(form._cid) === String(_cid)) {
        setForm({
          _cid: null,
          id: null,
          product: "",
          quantity: "",
          unit: "",
          description: "",
          manual_description: "",
          estimated_unit_cost: "",
          estimated_total: "",
        });
      }
    } catch (err) {
      console.error(err);
      const data = err?.response?.data;
      alert(`No se pudo eliminar.\n\n${data ? JSON.stringify(data, null, 2) : err?.message || ""}`);
    } finally {
      setBusyItemOp(false);
    }
  };

  const openClassifier = () => {
    window.open("/docs/clasificador.pdf", "_blank", "noopener");
  };

  /* ──────────────── “Ver Catálogo” modal behaviors (solo catálogo) ──────────────────────── */
  const openCatalogModal = () => {
    if (manualItemsMode) return;
    setCatalogModalProduct(form.product || "");
    setCatalogModalDescs([]);
    setShowCatalogModal(true);
  };

  useEffect(() => {
    if (manualItemsMode) return;
    if (!showCatalogModal) return;
    if (!catalogModalProduct) {
      setCatalogModalDescs([]);
      return;
    }
    let cancelled = false;
    async function fetchDescs() {
      try {
        const resp = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(catalogModalProduct));
        const list = resp.data || [];
        if (!cancelled) {
          setCatalogModalDescs(list);
          setDescCache((prev) => ({ ...prev, [String(catalogModalProduct)]: list }));
        }
      } catch {
        if (!cancelled) setCatalogModalDescs([]);
      }
    }
    fetchDescs();
    return () => {
      cancelled = true;
    };
  }, [showCatalogModal, catalogModalProduct, manualItemsMode]);

  /* ───────────────── “Registrar” (nuevo ItemDescription) (solo catálogo) ─────────────────── */
  const openRegisterModal = () => {
    if (manualItemsMode) return;
    setRegisterForm({ product: form.product || "", text: "", estimated_unit_cost: "" });
    setShowRegisterModal(true);
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    if (manualItemsMode) return;

    if (!registerForm.product || !registerForm.text.trim()) {
      alert("Selecciona Objeto del Gasto y escribe la descripción.");
      return;
    }

    const costNum = Number(registerForm.estimated_unit_cost);
    if (!Number.isFinite(costNum) || costNum <= 0) {
      alert("Captura un costo válido (> 0).");
      return;
    }

    setBusyRegister(true);
    try {
      const payload = {
        product: Number(registerForm.product),
        text: registerForm.text.trim(),
        estimated_unit_cost: Number(costNum.toFixed(2)),
      };

      const resp = await apiClient.post(STEP2_SPECS.itemDescriptionsPostUrl, payload);

      if (String(form.product) === String(registerForm.product)) {
        try {
          const refresh = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(form.product));
          const list = refresh.data || [];
          setDescOptions(list);
          setDescCache((prev) => ({ ...prev, [String(form.product)]: list }));
        } catch {}
      }
      if (String(catalogModalProduct) === String(registerForm.product)) {
        try {
          const refresh = await apiClient.get(STEP2_SPECS.itemDescriptionsUrl(catalogModalProduct));
          const list = refresh.data || [];
          setCatalogModalDescs(list);
          setDescCache((prev) => ({ ...prev, [String(catalogModalProduct)]: list }));
        } catch {}
      }

      setFormPatched({
        product: String(registerForm.product),
        description: String(resp.data?.id ?? ""),
        manual_description: "",
        estimated_unit_cost: String(resp.data?.estimated_unit_cost ?? payload.estimated_unit_cost ?? ""),
      });

      setShowRegisterModal(false);
      alert("Descripción registrada correctamente.");
    } catch (err) {
      console.error(err);
      const data = err?.response?.data;
      alert(`No se pudo registrar la descripción.\n\n${data ? JSON.stringify(data, null, 2) : ""}`);
    } finally {
      setBusyRegister(false);
    }
  };

  /* ─────────────────────────── SAVE (PUT) ────────────────────────────────── */
  const doSaveAll = async ({ silent = false, bypassRealAmountBlock = false, overrideStatus = null } = {}) => {
    if (!ackCostRealistic) {
      if (!silent) alert('Debes confirmar "costo aproximado pero realista" para poder guardar.');
      throw new Error("Blocked: ack cost realistic required");
    }

    if (!bypassRealAmountBlock && disableSave) {
      if (!silent) {
        alert(
          "No puedes guardar cambios todavía.\n\nDebes capturar el monto real (con auditoría) antes de guardar la requisición."
        );
      }
      throw new Error("Blocked: real amount required");
    }

    const finalStatus = overrideStatus ?? headerForm.status;

    const payload = {
      requesting_department: numOrNull(headerForm.requesting_department),
      project: numOrNull(headerForm.project),
      funding_source: numOrNull(headerForm.funding_source),
      budget_unit: numOrNull(headerForm.budget_unit),
      agreement: numOrNull(headerForm.agreement),
      tender: numOrNull(headerForm.tender),
      external_service: numOrNull(headerForm.external_service),

      requisition_reason: headerForm.requisition_reason ?? "",
      observations,

      ack_cost_realistic: ackCostRealistic,

      status: finalStatus,
    };

    const result = await saveWithDuplicateCheck({
      reqId: requisition.id,
      payload,
      method: "put",
    });

    if (!result.ok && result.cancelled) {
      if (!silent) alert("Envío/guardado cancelado: revisa datos para evitar duplicado.");
      throw new Error("Blocked: duplicate cancelled");
    }

    const updated = result.data;

    // ✅ REHIDRATACIÓN
    try {
      setHeaderForm((prev) => ({
        ...prev,
        requesting_department: coerceId(updated.requesting_department),
        project: coerceId(updated.project),
        funding_source: coerceId(updated.funding_source),
        budget_unit: coerceId(updated.budget_unit),
        agreement: coerceId(updated.agreement),
        tender: coerceId(updated.tender),
        external_service: coerceId(updated.external_service),
        requisition_reason: updated.requisition_reason || "",
        status: updated.status || prev.status,
      }));
      setObservations(updated.observations || "");
      setAckCostRealistic(Boolean(updated.ack_cost_realistic));

      if (Array.isArray(updated.items)) {
        setItems(
          (updated.items || []).map((it) => ({
            _cid: String(it.id),
            id: it.id,
            product: coerceId(it.product),
            quantity: Number(it.quantity ?? 0),
            unit: coerceId(it.unit),

            description: coerceId(it.description),
            manual_description: it.manual_description || "",

            description_text: it.description_text || "",
            description_display: it.description_display || "",

            estimated_unit_cost:
              it.estimated_unit_cost === null || typeof it.estimated_unit_cost === "undefined"
                ? ""
                : Number(it.estimated_unit_cost),
            estimated_total:
              it.estimated_total === null || typeof it.estimated_total === "undefined" ? "" : Number(it.estimated_total),
          }))
        );
      }

      setRealAmountLogs(Array.isArray(updated.real_amount_logs) ? updated.real_amount_logs : []);
    } catch {
      // no rompas guardado
    }

    onSaved?.(updated);
    setHasUnsavedChanges(false);

    if (!silent) {
      const extra = result.forced ? "\n\n(Confirmaste un posible duplicado.)" : "";
      alert(`Requisición #${requisition.id} guardada correctamente.${extra}`);
    }

    return updated;
  };

  const saveAll = async () => {
    setBusySave(true);
    try {
      await doSaveAll({ silent: false });
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("Blocked:")) return;

      console.error(err);
      const data = err?.response?.data;
      if (data) alert(`No se pudo guardar.\n\n${JSON.stringify(data, null, 2)}`);
      else alert("No se pudo guardar. Revisa los datos.");
    } finally {
      setBusySave(false);
    }
  };

  // ✅ handler para enviar ahora (status="sent") usando el wrapper 409
  const sendNow = async () => {
    if (items.length === 0) {
      alert("No puedes enviar una requisición sin partidas.");
      return;
    }

    if (!window.confirm("¿Enviar esta requisición a Unidad Central?")) return;

    setBusySave(true);
    try {
      await doSaveAll({ silent: false, overrideStatus: "sent" });
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.includes("Blocked:")) return;

      console.error(err);
      const data = err?.response?.data;
      if (data) alert(`No se pudo enviar.\n\n${JSON.stringify(data, null, 2)}`);
      else alert("No se pudo enviar. Revisa los datos.");
    } finally {
      setBusySave(false);
    }
  };

  /* ───────────────────── Admin: guardar monto real ───────────────────────── */
  const saveRealAmount = async () => {
    try {
      if (!adminLike) {
        alert("Solo administradores pueden capturar el monto real.");
        return;
      }

      if (quoteDraftInvalid) {
        window.alert(
          "Tienes una cotización seleccionada pero sin partidas marcadas.\n\n" +
            "Completa los checkboxes o quita el PDF para poder capturar el monto real."
        );
        throw new Error("Blocked: quote draft incomplete");
      }

      if (!ackCostRealistic) {
        window.alert(
          'Para capturar el monto real, primero marca: "Confirmo que el costo aproximado pero realista ha sido verificado (requisito para imprimir/exportar PDF)."'
        );
        throw new Error("Blocked: ack cost realistic required");
      }

      const hasItemsLocal = Array.isArray(items) && items.length > 0;
      const itemsSum = sumEstimatedTotals(items);
      if (!hasItemsLocal || !(itemsSum > 0)) {
        alert("No puedes capturar el monto real si la requisición no tiene partidas registradas.");
        throw new Error("Blocked: real amount requires items");
      }

      const amountNum = Number(realAmountDraft);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        alert("Monto real debe ser mayor a 0.");
        return;
      }

      const reason = realAmountReason.trim();
      if (!reason) {
        alert("Debes escribir el motivo (auditoría).");
        return;
      }

      setBusyRealAmount(true);
      try {
        const res = await apiClient.post(`/requisitions/${requisition.id}/set_real_amount/`, {
          real_amount: realAmountDraft,
          reason,
        });

        const data = res?.data ?? {};
        const savedNum = Number(data.real_amount ?? amountNum);
        const safeSavedNum = Number.isFinite(savedNum) ? savedNum : amountNum;

        setRealAmountBase(safeSavedNum);
        setRealAmountDraft(String(data.real_amount ?? safeSavedNum.toFixed(2)));

        try {
          const refreshed = await apiClient.get(`/requisitions/${requisition.id}/`);
          const r = refreshed.data;

          const newValNum = Number(r.real_amount ?? safeSavedNum);
          setRealAmountBase(Number.isFinite(newValNum) ? newValNum : safeSavedNum);

          setRealAmountDraft(r.real_amount === null || typeof r.real_amount === "undefined" ? "" : String(r.real_amount));

          setRealAmountLogs(Array.isArray(r.real_amount_logs) ? r.real_amount_logs : []);
          onSaved?.(r);
        } catch {}

        setRealAmountPendingDelta(0);
        setRealAmountNeedsUpdate(false);
        setRealAmountCaptured(true);
        setRealAmountReason("");

        if (hasUnsavedChanges) {
          try {
            setBusySave(true);
            await doSaveAll({ silent: true, bypassRealAmountBlock: true });
          } catch (err) {
            const msg = String(err?.message || "");
            if (!msg.includes("Blocked:")) console.error(err);
          } finally {
            setBusySave(false);
          }
        }

        alert("Monto real guardado con auditoría.");
      } catch (err) {
        const data = err?.response?.data;
        const msg = data || { message: err?.message || "Error desconocido" };
        alert(`No se pudo guardar monto real.\n\n${JSON.stringify(msg, null, 2)}`);
      } finally {
        setBusyRealAmount(false);
      }
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.startsWith("Blocked:")) return;
      console.error(err);
      alert("No se pudo guardar monto real. Revisa los datos.");
    }
  };

  if (!requisition) return <LoadingSpinner />;

  // habilitar inputs del paso 2
  const baseEnabled = manualItemsMode ? !!form.product : !!form.description;

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
              {Object.keys(CATALOG_META).map((key) => (
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

              {/* Monto real (solo lectura) */}
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

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={handleCancelToList}
              disabled={busyItemOp || busySave || busyRealAmount}
              className={`px-4 py-2 rounded ${busyItemOp || busySave || busyRealAmount ? "bg-slate-100" : "bg-slate-200 hover:bg-slate-300"}`}
            >
              Cancelar
            </button>

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

          {/* ✅ WARNING solo en modo manual */}
          {manualItemsMode ? <ManualUomWarning unitLabel={currentUnitLabel} /> : null}

          {loadingCatalogs ? (
            <LoadingSpinner />
          ) : (
            <>
              {adminLike && realAmountNeedsUpdate && !realAmountCaptured && (
                <div className="mb-4 border border-amber-300 bg-amber-50 text-amber-900 rounded p-3 text-sm">
                  <div className="font-semibold">No puedes guardar cambios todavía.</div>
                  <div className="mt-1">
                    Debes capturar el <b>monto real</b> (con auditoría) antes de guardar la requisición.
                  </div>
                  <div className="mt-2 text-[12px] text-amber-800">
                    Nota: el <b>monto sugerido</b> es una referencia. Puede no coincidir con el costo real exacto.
                  </div>
                </div>
              )}

              {/* Form items */}
              <form onSubmit={addOrUpdateItem} className="grid md:grid-cols-12 gap-3">
                {/* Objeto del Gasto */}
                <div className="md:col-span-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Objeto del Gasto</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.product}
                    onChange={(e) =>
                      setFormPatched({
                        product: e.target.value,
                        description: "",
                        manual_description: "",
                        estimated_unit_cost: "",
                        estimated_total: "",
                        quantity: "",
                        unit: "",
                      })
                    }
                  >
                    <option value="">— Selecciona —</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.description}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Descripción */}
                <div className="md:col-span-8">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>

                  {manualItemsMode ? (
                    <input
                      className="w-full border rounded px-2 py-1"
                      value={form.manual_description}
                      onChange={(e) => setFormPatched({ manual_description: e.target.value })}
                      disabled={!form.product}
                      placeholder={form.product ? "Escribe la descripción (manual)" : "Selecciona Objeto del Gasto primero"}
                    />
                  ) : (
                    <select
                      className="w-full border rounded px-2 py-1"
                      value={form.description}
                      onChange={(e) => handleDescriptionChange(e.target.value)}
                      disabled={!form.product}
                    >
                      <option value="">{form.product ? "— Selecciona —" : "Selecciona Objeto del Gasto primero"}</option>
                      {descOptions.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.text}
                          {d.estimated_unit_cost ? ` — $${fmtMoney(d.estimated_unit_cost)}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Cantidad */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border rounded px-2 py-1"
                    value={form.quantity}
                    onChange={(e) => setFormPatched({ quantity: e.target.value })}
                    disabled={!baseEnabled}
                  />
                </div>

                {/* Unidad */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unidad</label>
                  <select
                    className="w-full border rounded px-2 py-1"
                    value={form.unit}
                    onChange={(e) => setFormPatched({ unit: e.target.value })}
                    disabled={!baseEnabled}
                  >
                    <option value="">— Selecciona —</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Costo unitario */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Costo unitario</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={`w-full border rounded px-2 py-1 ${manualItemsMode ? "" : "bg-gray-100"}`}
                    value={form.estimated_unit_cost}
                    readOnly={!manualItemsMode}
                    disabled={!baseEnabled}
                    onChange={(e) => {
                      if (!manualItemsMode) return;
                      setFormPatched({ estimated_unit_cost: e.target.value });
                    }}
                    placeholder="0.00"
                  />
                  <div className="text-[11px] text-gray-500 mt-1">
                    {manualItemsMode ? "Captura manualmente el costo unitario." : "Se llena automáticamente desde la descripción."}
                  </div>
                </div>

                {/* Total (READONLY) */}
                <div className="md:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Monto estimado (total)</label>
                  <input
                    type="number"
                    className="w-full border rounded px-2 py-1 bg-gray-100"
                    value={form.estimated_total}
                    readOnly
                    placeholder="0.00"
                  />
                  <div className="text-[11px] text-gray-500 mt-1">Se calcula automáticamente (cantidad × unitario).</div>
                </div>

                {/* Action row */}
                <div className="md:col-span-12 flex items-end gap-2">
                  <button
                    type="submit"
                    disabled={busyItemOp}
                    className={`px-3 py-2 rounded text-white ${busyItemOp ? "bg-green-300" : "bg-green-600 hover:bg-green-700"}`}
                  >
                    {busyItemOp ? "Guardando..." : form._cid ? "Guardar cambios" : "Agregar"}
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
                          manual_description: "",
                          estimated_unit_cost: "",
                          estimated_total: "",
                        })
                      }
                      disabled={busyItemOp}
                    >
                      Cancelar
                    </button>
                  )}

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openClassifier();
                      }}
                      className="px-3 py-2 rounded bg-slate-200 hover:bg-slate-300"
                    >
                      Clasificador
                    </button>

                    {!manualItemsMode && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openCatalogModal();
                          }}
                          className="px-3 py-2 rounded bg-slate-200 hover:bg-slate-300"
                        >
                          Ver Catálogo
                        </button>

                        {/* [LICIT] Registrar oculto (alta solo vía Django admin) */}
                        {SHOW_REGISTER_PRODUCT_BUTTON ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              openRegisterModal();
                            }}
                            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                          >
                            Registrar
                          </button>
                        ) : null}
                      </>
                    )}
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
                        <th className="px-2 py-2 text-left">Descripción</th>
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
                        items.map((row, idx) => {
                          const descDisplay = getNiceDescDisplay({ row, descCache });

                          return (
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
                              <td className="px-2 py-2">{descDisplay}</td>
                              <td className="px-2 py-2">
                                <div className="flex justify-center gap-2">
                                  <button
                                    type="button"
                                    className={`px-2 py-1 rounded text-white ${busyItemOp ? "bg-blue-300" : "bg-blue-600 hover:bg-blue-700"}`}
                                    onClick={() => editRow(row)}
                                    disabled={busyItemOp}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className={`px-2 py-1 rounded text-white ${busyItemOp ? "bg-red-300" : "bg-red-600 hover:bg-red-700"}`}
                                    onClick={() => deleteRow(row._cid)}
                                    disabled={busyItemOp}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Panel de Cotizaciones (PDF) */}
              <RequisitionQuotesPanel
                requisitionId={requisition.id}
                items={items}
                onDraftInvalidChange={setQuoteDraftInvalid}
              />

              {/* Checkbox ack_cost_realistic */}
              <div className="mt-6 border rounded p-3 bg-gray-50">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={ackCostRealistic}
                    onChange={(e) => {
                      setAckCostRealistic(e.target.checked);
                      setHasUnsavedChanges(true);
                    }}
                  />
                  <span className="text-sm">
                    Confirmo que el <strong>costo aproximado pero realista</strong> ha sido verificado (requisito para
                    imprimir/exportar PDF).
                  </span>
                </label>
              </div>

              {/* Admin: Monto real + auditoría */}
              <div className="mt-6 border rounded p-4 bg-amber-50">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Admin — Capturar monto real</h3>
                  <div className="text-xs text-gray-600">
                    Monto actual: <strong>{fmtMoney(requisition.real_amount)}</strong>
                  </div>
                </div>

                {!adminLike ? (
                  <p className="text-sm text-gray-700 mt-2">Solo administradores pueden capturar/editar el monto real.</p>
                ) : (
                  <div className="grid md:grid-cols-3 gap-3 mt-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Monto real {realAmountNeedsUpdate ? "(sugerido)" : ""}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="w-full border rounded px-2 py-1"
                        value={realAmountDraft}
                        onChange={(e) => setRealAmountDraft(e.target.value)}
                        placeholder="0.00"
                      />
                      {realAmountNeedsUpdate && (
                        <div className="text-[11px] text-amber-800 mt-1">
                          Sugerido = monto real anterior ({fmtMoney(realAmountBase)}) + delta de partidas ({fmtMoney(realAmountPendingDelta)}).
                        </div>
                      )}
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
                      {realAmountNeedsUpdate && (
                        <div className="text-[11px] text-amber-800 mt-1">
                          Recomendación: verifica el costo real exacto antes de guardar. El monto sugerido puede variar.
                        </div>
                      )}
                    </div>

                    <div className="md:col-span-3 flex justify-end">
                      <button
                        type="button"
                        disabled={busyRealAmount || items.length === 0 || disableRealAmountByAck || disableRealAmountByQuoteDraft}
                        onClick={saveRealAmount}
                        className={`px-4 py-2 rounded text-white ${
                          busyRealAmount || items.length === 0 || disableRealAmountByAck || disableRealAmountByQuoteDraft
                            ? "bg-amber-300"
                            : "bg-amber-600 hover:bg-amber-700"
                        }`}
                        title={
                          disableRealAmountByQuoteDraft
                            ? "Hay una cotización seleccionada sin partidas marcadas (completa o quita el PDF)."
                            : disableRealAmountByAck
                              ? 'Primero marca la verificación del costo aproximado pero realista.'
                              : items.length === 0
                                ? "Para capturar monto real, primero registra al menos una partida."
                                : ""
                        }
                      >
                        {busyRealAmount
                          ? "Guardando..."
                          : disableRealAmountByQuoteDraft
                            ? "Guardar monto real (cotización incompleta)"
                            : disableRealAmountByAck
                              ? "Guardar monto real (verifica costo)"
                              : "Guardar monto real (con auditoría)"}
                      </button>
                    </div>

                    {adminLike && disableRealAmountByQuoteDraft && (
                      <div className="md:col-span-3 text-[11px] text-amber-800 mt-1">
                        Completa la cotización (marca partidas) o quita el PDF para poder capturar el monto real.
                      </div>
                    )}

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
                  onChange={(e) => {
                    setObservations(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                />
              </div>

              {/* Footer actions (Enviar + Guardar) */}
              <div className="mt-6 flex items-center justify-between">
                <div className="flex gap-2">
                  <button type="button" onClick={goPrev} className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300">
                    Anterior
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelToList}
                    disabled={busyItemOp || busySave || busyRealAmount}
                    className={`px-4 py-2 rounded ${
                      busyItemOp || busySave || busyRealAmount ? "bg-slate-100" : "bg-slate-200 hover:bg-slate-300"
                    }`}
                  >
                    Cancelar
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busySave || disableSave || disableSaveByAck || items.length === 0}
                    onClick={sendNow}
                    className={`px-4 py-2 rounded text-white ${
                      busySave || disableSave || disableSaveByAck || items.length === 0
                        ? "bg-indigo-400"
                        : "bg-indigo-600 hover:bg-indigo-700"
                    }`}
                    title={
                      items.length === 0
                        ? "Primero registra al menos una partida."
                        : disableSaveByAck
                          ? 'Debes confirmar "costo aproximado pero realista" para poder enviar.'
                          : disableSave
                            ? "Debes capturar el monto real antes de enviar."
                            : ""
                    }
                  >
                    {busySave ? "Enviando..." : "Enviar"}
                  </button>

                  <button
                    type="button"
                    disabled={busySave || disableSave || disableSaveByAck}
                    onClick={saveAll}
                    className={`px-4 py-2 rounded text-white ${
                      busySave || disableSave || disableSaveByAck ? "bg-green-400" : "bg-green-600 hover:bg-green-700"
                    }`}
                    title={
                      disableSaveByAck
                        ? 'Debes confirmar "costo aproximado pero realista" para poder guardar.'
                        : disableSave
                          ? "Debes capturar el monto real antes de guardar cambios."
                          : ""
                    }
                  >
                    {busySave ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ───────────── Modals ───────────── */}
      {showCatalogModal && !manualItemsMode && (
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
                    <th className="px-2 py-2 text-right">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {catalogModalProduct && catalogModalDescs.length === 0 ? (
                    <tr>
                      <td className="px-2 py-3 text-gray-500" colSpan={2}>
                        Sin descripciones registradas.
                      </td>
                    </tr>
                  ) : (
                    catalogModalDescs.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="px-2 py-2">{d.text}</td>
                        <td className="px-2 py-2 text-right">{fmtMoney(d.estimated_unit_cost)}</td>
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

      {showRegisterModal && !manualItemsMode && (
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

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Costo (obligatorio)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full border rounded px-2 py-1"
                value={registerForm.estimated_unit_cost}
                onChange={(e) => setRegisterForm((f) => ({ ...f, estimated_unit_cost: e.target.value }))}
                placeholder="0.00"
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