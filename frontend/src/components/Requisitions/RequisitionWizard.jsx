// frontend/src/components/Requisitions/RequisitionWizard.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import apiClient from "../../api/apiClient";
import RequisitionForm from "./RequisitionForm";
import RequisitionItems from "./RequisitionItems";
import RequisitionQuotesPanel from "./RequisitionQuotesPanel";

export default function RequisitionWizard() {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  // ----- Step 1 data -----
  const [formData, setFormData] = useState(() => ({
    department: user?.department || "",
    project: "",
    funding_source: "",
    budget_unit: "",
    agreement: "",
    tender: "",
    category: "",
    title: "",
    description: "",
    external_service: "",
    // Display-only
    fecha: new Date().toLocaleDateString("es-MX"),
    solicitante: ((user?.first_name || "") + " " + (user?.last_name || "")).trim(),
    project_label: "",
    funding_source_label: "",
    budget_unit_label: "",
    agreement_label: "",
    tender_label: "",
    category_label: "",
    external_service_label: "",
  }));

  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      department: user?.department || prev.department,
      solicitante:
        ((user?.first_name || "") + " " + (user?.last_name || "")).trim() || prev.solicitante,
    }));
  }, [user]);

  const step1FormRef = useRef(null);

  // ====== Step 2 shared state ======
  const [items, setItems] = useState([]);
  const [requisitionNumber, setRequisitionNumber] = useState("");
  const [observations, setObservations] = useState("");
  const [saving, setSaving] = useState(false);

  // ✅ ACK costo aproximado realista
  const [ackCostRealistic, setAckCostRealistic] = useState(false);
  const disableSaveByAck = !ackCostRealistic;

  // ✅ Draft requisition (solo se crea cuando ya hay items válidos)
  const [draftReq, setDraftReq] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);

  // ✅ Bloqueo si hay PDF seleccionado sin partidas marcadas
  const [quoteDraftInvalid, setQuoteDraftInvalid] = useState(false);

  // --- Fetch Departments to resolve requesting_department ID ---
  const [departments, setDepartments] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await apiClient.get("/catalogs/departments/");
        setDepartments(data || []);
      } catch (err) {
        console.error("Error loading departments", err);
      }
    })();
  }, []);

  const findDepartmentId = () => {
    if (!formData.department) return null;
    const d = departments.find(
      (d) =>
        d.name === formData.department ||
        (typeof formData.department === "string" && formData.department.includes(d.name)) ||
        (typeof formData.department === "string" && d.code && formData.department.includes(d.code))
    );
    return d ? d.id : null;
  };

  const handleCancel = async () => {
    // Si ya existe requisición (draft), intentamos borrarla para no dejar basura
    if (draftReq?.id) {
      const ok = window.confirm("¿Cancelar y descartar la requisición en borrador?");
      if (!ok) return;

      try {
        await apiClient.delete(`/requisitions/${draftReq.id}/`);
      } catch (e) {
        console.warn("No se pudo borrar borrador:", e?.response?.status || e?.message);
      }
    } else {
      const ok = window.confirm("¿Cancelar?");
      if (!ok) return;
    }
    navigate("/requisitions");
  };

  const handleResetStep1 = async () => {
    if (draftReq?.id) {
      const ok = window.confirm("Esto borrará el borrador en backend. ¿Continuar?");
      if (!ok) return;

      try {
        await apiClient.delete(`/requisitions/${draftReq.id}/`);
      } catch (e) {
        console.warn("No se pudo borrar borrador:", e?.response?.status || e?.message);
      }
    }

    setDraftReq(null);

    setFormData({
      department: user?.department || "",
      project: "",
      funding_source: "",
      budget_unit: "",
      agreement: "",
      tender: "",
      category: "",
      title: "",
      description: "",
      external_service: "",
      fecha: new Date().toLocaleDateString("es-MX"),
      solicitante: ((user?.first_name || "") + " " + (user?.last_name || "")).trim(),
      project_label: "",
      funding_source_label: "",
      budget_unit_label: "",
      agreement_label: "",
      tender_label: "",
      category_label: "",
      external_service_label: "",
    });

    setItems([]);
    setRequisitionNumber("");
    setObservations("");
    setAckCostRealistic(false);
    setQuoteDraftInvalid(false);
    setStep(1);
  };

  const handleNextFromStep1 = () => {
    const ok = step1FormRef.current?.reportValidity();
    if (!ok) return;

    const deptId = findDepartmentId();
    if (!deptId) {
      showToast("No se pudo determinar el Departamento Solicitante (catálogo). Revisa el campo.", "error");
      return;
    }

    setStep(2);
  };

  // ===== Helpers =====
  const idOrUndef = (v) => (v === "" || v === null || typeof v === "undefined" ? undefined : Number(v));

  const strOrUndef = (v) => {
    const s = (v ?? "").toString().trim();
    return s.length ? s : undefined;
  };

  const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v !== "undefined"));

  const parseMoney = (v) => {
    if (v === null || typeof v === "undefined") return NaN;
    if (typeof v === "number") return v;
    const s = String(v).trim();
    if (!s) return NaN;
    const cleaned = s.replace(/\$/g, "").replace(/\s+/g, "").replace(/,/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  };

  const buildHeaderPayload = () => {
    const deptId = findDepartmentId();
    if (!deptId) return null;

    const base = {
      requesting_department: deptId,
      project: idOrUndef(formData.project),
      funding_source: idOrUndef(formData.funding_source),
      budget_unit: idOrUndef(formData.budget_unit),
      agreement: idOrUndef(formData.agreement),
      tender: idOrUndef(formData.tender),
      category: idOrUndef(formData.category),
      external_service: idOrUndef(formData.external_service),
      requisition_reason: strOrUndef(formData.description),
      observations: strOrUndef(observations),
      ack_cost_realistic: !!ackCostRealistic,
    };

    return compact(base);
  };

  const normalizeItemsForPayload = (itemsList) => {
    const invalidLines = [];

    const normalizedItems = (itemsList || []).map((it, idx) => {
      const product = Number(it.product);
      const quantity = Number(it.quantity);
      const unit = Number(it.unit);
      const description = Number(it.description);

      let estimatedTotal = parseMoney(it.estimated_total);

      if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0) {
        const unitCost = parseMoney(it.estimated_unit_cost);
        if (Number.isFinite(unitCost) && unitCost > 0 && Number.isFinite(quantity) && quantity > 0) {
          estimatedTotal = Number((unitCost * quantity).toFixed(2));
        }
      }

      if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0) {
        invalidLines.push(idx + 1);
      }

      const payloadItem = {
        ...(it.id ? { id: Number(it.id) } : {}),
        product,
        quantity,
        unit,
        description,
        estimated_total: Number(estimatedTotal.toFixed(2)),
      };

      const unitCost = parseMoney(it.estimated_unit_cost);
      if (Number.isFinite(unitCost) && unitCost > 0) {
        payloadItem.estimated_unit_cost = Number(unitCost.toFixed(2));
      }

      return payloadItem;
    });

    return { invalidLines, normalizedItems };
  };

  const mergeItemIds = (localItems, serverItems) => {
    const to2 = (v) => {
      const n = parseMoney(v);
      return Number.isFinite(n) ? Number(n).toFixed(2) : "";
    };

    const keyOf = (it) =>
      [
        String(it.product ?? ""),
        String(it.description ?? ""),
        String(it.unit ?? ""),
        String(Number(it.quantity ?? "") || ""),
        to2(it.estimated_total),
      ].join("|");

    const buckets = new Map();
    (serverItems || []).forEach((s) => {
      const k = keyOf(s);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    });

    return (localItems || []).map((l) => {
      const k = keyOf(l);
      const arr = buckets.get(k);
      if (arr && arr.length) {
        const picked = arr.shift();
        return { ...l, id: picked.id };
      }
      return l;
    });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ FIX CRÍTICO: evitar doble POST por race condition
  // Usamos refs para no depender del timing de setState.
  // ─────────────────────────────────────────────────────────────────────────
  const draftReqRef = useRef(null);
  useEffect(() => {
    draftReqRef.current = draftReq;
  }, [draftReq]);

  const draftCreatePromiseRef = useRef(null);

  async function createDraftWithItems(normalizedItems) {
    if (draftReqRef.current?.id) return draftReqRef.current;

    if (draftCreatePromiseRef.current) {
      return await draftCreatePromiseRef.current;
    }

    const header = buildHeaderPayload();
    if (!header) return null;

    if (!Array.isArray(normalizedItems) || normalizedItems.length === 0) return null;

    setDraftBusy(true);

    draftCreatePromiseRef.current = (async () => {
      const res = await apiClient.post("/requisitions/", { ...header, items: normalizedItems });
      const created = res.data;

      // IMPORTANT: set ref primero (evita que otra llamada vuelva a crear)
      draftReqRef.current = created;

      setDraftReq(created);
      setRequisitionNumber((prev) => prev || String(created?.id || ""));

      if (Array.isArray(created?.items)) {
        setItems((prev) => mergeItemIds(prev, created.items));
      }

      return created;
    })()
      .catch((e) => {
        console.error("No se pudo crear requisición:", e);
        throw e;
      })
      .finally(() => {
        draftCreatePromiseRef.current = null;
        setDraftBusy(false);
      });

    return await draftCreatePromiseRef.current;
  }

  // ✅ Autosave (debounced): crea con POST solo cuando ya hay items válidos; luego PUT.
  const autosaveTimerRef = useRef(null);
  const lastSignatureRef = useRef("");

  const autosaveSignature = useMemo(() => {
    if (step !== 2) return "";

    const header = buildHeaderPayload();
    if (!header) return "";

    if (!items || items.length === 0) return "";

    const { invalidLines, normalizedItems } = normalizeItemsForPayload(items);
    if (invalidLines.length) return "INVALID";

    const stripIds = (arr) => (arr || []).map(({ id, ...rest }) => rest);

    return JSON.stringify({
      header,
      items: stripIds(normalizedItems),
      ack: !!ackCostRealistic,
      obs: observations || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, items, ackCostRealistic, observations, formData, departments]);

  async function autosaveNow({ silent = true } = {}) {
    const header = buildHeaderPayload();
    if (!header) return null;

    if (!items || items.length === 0) return null;

    const { invalidLines, normalizedItems } = normalizeItemsForPayload(items);
    if (invalidLines.length) return null;

    // 1) Si no existe requisición aún → POST con items (NO vacío)
    if (!draftReqRef.current?.id) {
      const created = await createDraftWithItems(normalizedItems);
      if (!created?.id) return null;
      if (!silent) showToast("Requisición creada (borrador).", "success");
      return created;
    }

    // 2) Si ya existe → PUT
    try {
      setDraftBusy(true);

      const res = await apiClient.put(`/requisitions/${draftReqRef.current.id}/`, {
        ...header,
        items: normalizedItems,
      });

      const updated = res.data;
      draftReqRef.current = updated;
      setDraftReq(updated);

      if (Array.isArray(updated?.items)) {
        setItems((prev) => mergeItemIds(prev, updated.items));
      }

      if (!silent) showToast("Borrador guardado.", "success");
      return updated;
    } catch (e) {
      console.error("Autosave falló:", e);
      if (!silent) showToast("No se pudo guardar el borrador.", "error");
      return null;
    } finally {
      setDraftBusy(false);
    }
  }

  useEffect(() => {
    if (step !== 2) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    if (!autosaveSignature || autosaveSignature === "INVALID") return;

    const header = buildHeaderPayload();
    if (!header) return;

    if (autosaveSignature === lastSignatureRef.current) return;

    autosaveTimerRef.current = setTimeout(async () => {
      lastSignatureRef.current = autosaveSignature;
      await autosaveNow({ silent: true });
    }, 500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveSignature, step]);

  // ====== Finalizar ======
  const savingRef = useRef(false);

  const handleFinishFromStep2 = async () => {
    if (savingRef.current) return;

    if (quoteDraftInvalid) {
      showToast(
        "Tienes una cotización seleccionada pero sin partidas marcadas. Completa los checkboxes o quita el PDF.",
        "error"
      );
      return;
    }

    if (!ackCostRealistic) {
      showToast('Debes confirmar "costo aproximado pero realista" para poder guardar.', "error");
      return;
    }

    const header = buildHeaderPayload();
    if (!header) {
      showToast("No se pudo determinar el Departamento Solicitante.", "error");
      return;
    }

    if (!items || items.length === 0) {
      showToast("Agrega al menos una partida antes de continuar.", "error");
      return;
    }

    const { invalidLines } = normalizeItemsForPayload(items);
    if (invalidLines.length) {
      showToast(`Falta "Monto estimado" válido (> 0) en los renglones: ${invalidLines.join(", ")}`, "error");
      return;
    }

    try {
      savingRef.current = true;
      setSaving(true);

      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      const saved = await autosaveNow({ silent: true });
      const id = saved?.id || draftReqRef.current?.id;

      if (!id) {
        showToast("No se pudo guardar. Intenta de nuevo.", "error");
        return;
      }

      const effectiveNum = requisitionNumber || String(id);
      showToast(`Requisición #${effectiveNum} guardada correctamente.`, "success");
      navigate("/requisitions");
    } catch (e) {
      console.error(e);
      showToast("Error al finalizar requisición.", "error");
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const allItemsHaveId = useMemo(() => {
    if (!Array.isArray(items) || items.length === 0) return false;
    return items.every((it) => Boolean(it?.id));
  }, [items]);

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
            ackCostRealistic={ackCostRealistic}
            setAckCostRealistic={setAckCostRealistic}
          />

          {/* ✅ Panel Cotizaciones (requiere requisitionId + ids en items) */}
          {items.length === 0 ? (
            <div className="mt-6 border rounded p-4 bg-slate-50 text-sm text-gray-700">
              Agrega al menos una partida para habilitar cotizaciones.
            </div>
          ) : !draftReq?.id ? (
            <div className="mt-6 border rounded p-4 bg-slate-50 text-sm text-gray-700">
              Guardando borrador para habilitar cotizaciones (creando requisición e IDs)…
            </div>
          ) : !allItemsHaveId ? (
            <div className="mt-6 border rounded p-4 bg-slate-50 text-sm text-gray-700">
              Guardando borrador para habilitar cotizaciones (asignando IDs a partidas)…
            </div>
          ) : (
            <RequisitionQuotesPanel
              requisitionId={draftReq.id}
              items={items}
              onDraftInvalidChange={setQuoteDraftInvalid}
            />
          )}

          {/* Observaciones */}
          <div className="mt-6">
            <label className="block mb-2 font-medium">Observaciones</label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Escribe observaciones adicionales..."
              className="border p-2 w-full rounded min-h-[100px]"
            />
          </div>

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
              className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60 ${
                disableSaveByAck || quoteDraftInvalid ? "opacity-60" : ""
              }`}
              disabled={saving || disableSaveByAck || quoteDraftInvalid || draftBusy}
              title={
                quoteDraftInvalid
                  ? "Hay una cotización seleccionada sin partidas marcadas (completa o quita el PDF)."
                  : disableSaveByAck
                  ? 'Debes confirmar "costo aproximado pero realista" para poder guardar.'
                  : draftBusy
                  ? "Guardando borrador…"
                  : ""
              }
            >
              {saving || draftBusy
                ? "Guardando…"
                : quoteDraftInvalid
                ? "Guardar (cotización incompleta)"
                : disableSaveByAck
                ? "Guardar (confirma costo)"
                : "Guardar"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
