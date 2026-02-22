// frontend/src/components/Requisitions/RequisitionWizard.jsx
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";
import { useToast } from "../../contexts/ToastContext";
import apiClient from "../../api/apiClient";
import RequisitionForm from "./RequisitionForm";
import RequisitionItems from "./RequisitionItems";
import RequisitionQuotesPanel from "./RequisitionQuotesPanel";

/**
 * ✅ Wrapper: maneja 409 de duplicados (CREATE/UPDATE)
 * - interactive=false: NO muestra confirm (para autosave), solo regresa { cancelled:true, needsConfirmation:true }
 * - interactive=true: muestra confirm y si el usuario acepta reintenta con force_duplicates=1
 */
async function saveWithDuplicateCheck({
  reqId = null,
  payload,
  method = "put",
  interactive = true,
  actionLabel = "GUARDAR / CREAR",
}) {
  try {
    const url = method === "post" ? `/requisitions/` : `/requisitions/${reqId}/`;

    const res =
      method === "post"
        ? await apiClient.post(url, payload)
        : method === "patch"
          ? await apiClient.patch(url, payload)
          : await apiClient.put(url, payload);

    return { ok: true, data: res.data };
  } catch (err) {
    const httpStatus = err?.response?.status;
    const data = err?.response?.data;

    if (httpStatus === 409 && Array.isArray(data?.duplicates) && data.duplicates.length > 0) {
      // Modo no interactivo (autosave): NO popups
      if (!interactive) {
        return {
          ok: false,
          cancelled: true,
          needsConfirmation: true,
          duplicates: data.duplicates,
          window_days: data.window_days,
        };
      }

      const lines = data.duplicates.slice(0, 8).map((d) => {
        const when = d.date ? new Date(d.date).toLocaleString("es-MX") : "";
        const pct = Number(d.match_ratio ?? 0) * 100;
        const count = Number(d.match_count ?? 0);
        return `• #${d.id} — ${when} — match ${pct.toFixed(0)}% (${count} item(s))`;
      });

      const msg =
        `⚠️ Posible duplicado detectado (ventana ${data.window_days} días).\n\n` +
        lines.join("\n") +
        `\n\n¿Quieres ${actionLabel} de todos modos?`;

      const userAccepted = window.confirm(msg);

      if (!userAccepted) {
        return { ok: false, cancelled: true, duplicates: data.duplicates };
      }

      // Reintento con force_duplicates=1
      const forceUrl =
        method === "post"
          ? `/requisitions/?force_duplicates=1`
          : `/requisitions/${reqId}/?force_duplicates=1`;

      const res2 =
        method === "post"
          ? await apiClient.post(forceUrl, payload)
          : method === "patch"
            ? await apiClient.patch(forceUrl, payload)
            : await apiClient.put(forceUrl, payload);

      return { ok: true, data: res2.data, forced: true, duplicates: data.duplicates };
    }

    throw err;
  }
}

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

  // ✅ Draft requisition
  const [draftReq, setDraftReq] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);

  // ✅ Bloqueo si hay PDF seleccionado sin partidas marcadas
  const [quoteDraftInvalid, setQuoteDraftInvalid] = useState(false);

  // ✅ modo manual (tender = NO APLICA)
  // (para mostrar advertencia: descripción debe coincidir con Unidad de Medida)
  const manualItemsMode = useMemo(() => {
    const s = String(formData.tender_label || "").trim();
    if (!s) return false;
    return /NO\s*APLICA/i.test(s);
  }, [formData.tender_label]);

  // --- Fetch Departments ---
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
      showToast(
        "No se pudo determinar el Departamento Solicitante (catálogo). Revisa el campo.",
        "error"
      );
      return;
    }

    setStep(2);
  };

  // ===== Helpers =====
  const idOrUndef = (v) =>
    v === "" || v === null || typeof v === "undefined" ? undefined : Number(v);

  const strOrUndef = (v) => {
    const s = (v ?? "").toString().trim();
    return s.length ? s : undefined;
  };

  const compact = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v !== "undefined"));

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

      const manualText = String(it.manual_description ?? "").trim();
      const isManual =
        manualText.length > 0 ||
        it.description === null ||
        it.description === "" ||
        typeof it.description === "undefined";

      let estimatedTotal = parseMoney(it.estimated_total);

      const unitCost = parseMoney(it.estimated_unit_cost);

      if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0) {
        if (
          Number.isFinite(unitCost) &&
          unitCost > 0 &&
          Number.isFinite(quantity) &&
          quantity > 0
        ) {
          estimatedTotal = Number((unitCost * quantity).toFixed(2));
        }
      }

      // Validaciones
      if (!Number.isFinite(product) || product <= 0) invalidLines.push(idx + 1);
      if (!Number.isFinite(quantity) || quantity <= 0) invalidLines.push(idx + 1);
      if (!Number.isFinite(unit) || unit <= 0) invalidLines.push(idx + 1);

      if (isManual) {
        if (!manualText) invalidLines.push(idx + 1);
        if (!Number.isFinite(unitCost) || unitCost <= 0) invalidLines.push(idx + 1);
      } else {
        const description = Number(it.description);
        if (!Number.isFinite(description) || description <= 0) invalidLines.push(idx + 1);
      }

      if (!Number.isFinite(estimatedTotal) || estimatedTotal <= 0) invalidLines.push(idx + 1);

      const payloadItem = {
        ...(it.id ? { id: Number(it.id) } : {}),
        product,
        quantity,
        unit,
        estimated_total: Number(estimatedTotal.toFixed(2)),
      };

      if (isManual) {
        payloadItem.description = null;
        payloadItem.manual_description = manualText;
        payloadItem.estimated_unit_cost = Number(unitCost.toFixed(2));
      } else {
        payloadItem.description = Number(it.description);
        if (Number.isFinite(unitCost) && unitCost > 0) {
          payloadItem.estimated_unit_cost = Number(unitCost.toFixed(2));
        }
      }

      return payloadItem;
    });

    // dedup invalid lines
    const uniqInvalid = Array.from(new Set(invalidLines)).sort((a, b) => a - b);

    return { invalidLines: uniqInvalid, normalizedItems };
  };

  const mergeItemIds = (localItems, serverItems) => {
    const to2 = (v) => {
      const n = parseMoney(v);
      return Number.isFinite(n) ? Number(n).toFixed(2) : "";
    };

    const normNull = (v) => (v === null || typeof v === "undefined" ? "" : String(v));
    const normText = (v) => String(v ?? "").trim().toLowerCase();

    const keyOf = (it) =>
      [
        normNull(it.product),
        normNull(it.unit),
        normNull(Number(it.quantity ?? "") || ""),
        to2(it.estimated_total),
        normNull(it.description),
        normText(it.manual_description ?? it.description_text ?? it.description_label ?? ""),
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
  // ✅ evitar doble POST por race condition
  // ─────────────────────────────────────────────────────────────────────────
  const draftReqRef = useRef(null);
  useEffect(() => {
    draftReqRef.current = draftReq;
  }, [draftReq]);

  const draftCreatePromiseRef = useRef(null);

  /**
   * Crea el borrador con POST /requisitions/
   * Ahora pasa por saveWithDuplicateCheck (para 409 en CREATE).
   */
  async function createDraftWithItems(normalizedItems, { interactiveDuplicates = true } = {}) {
    if (draftReqRef.current?.id) return { ok: true, data: draftReqRef.current, forced: false };

    if (draftCreatePromiseRef.current) {
      return await draftCreatePromiseRef.current;
    }

    const header = buildHeaderPayload();
    if (!header) return { ok: false, error: "HEADER" };

    if (!Array.isArray(normalizedItems) || normalizedItems.length === 0)
      return { ok: false, error: "NO_ITEMS" };

    setDraftBusy(true);

    draftCreatePromiseRef.current = (async () => {
      const result = await saveWithDuplicateCheck({
        payload: { ...header, items: normalizedItems },
        method: "post",
        interactive: interactiveDuplicates,
        actionLabel: "CREAR",
      });

      if (!result.ok && result.cancelled) {
        return {
          ok: false,
          cancelled: true,
          needsConfirmation: !!result.needsConfirmation,
          duplicates: result.duplicates,
        };
      }

      const created = result.data;

      draftReqRef.current = created;
      setDraftReq(created);
      setRequisitionNumber((prev) => prev || String(created?.id || ""));

      if (Array.isArray(created?.items)) {
        setItems((prev) => mergeItemIds(prev, created.items));
      }

      return { ok: true, data: created, forced: !!result.forced, duplicates: result.duplicates };
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

  // ✅ Guardar centralizado (solo guardar)
  async function doSaveAll({ silent = true, interactiveDuplicates = true } = {}) {
    const header = buildHeaderPayload();
    if (!header) return { ok: false, error: "HEADER" };

    if (!items || items.length === 0) return { ok: false, error: "NO_ITEMS" };

    const { invalidLines, normalizedItems } = normalizeItemsForPayload(items);
    if (invalidLines.length) return { ok: false, error: "INVALID_LINES", invalidLines };

    // 1) Si no existe requisición aún → POST con items
    if (!draftReqRef.current?.id) {
      const createdRes = await createDraftWithItems(normalizedItems, { interactiveDuplicates });
      if (!createdRes.ok) {
        return { ...createdRes, ok: false, error: createdRes.error || "CREATE_BLOCKED" };
      }

      const created = createdRes.data;
      return {
        ok: true,
        data: created,
        forced: !!createdRes.forced,
        duplicates: createdRes.duplicates,
      };
    }

    // 2) Si ya existe → PUT
    try {
      setDraftBusy(true);

      const payload = {
        ...header,
        items: normalizedItems,
      };

      const result = await saveWithDuplicateCheck({
        reqId: draftReqRef.current.id,
        payload,
        method: "put",
        interactive: interactiveDuplicates,
        actionLabel: "GUARDAR",
      });

      if (!result.ok && result.cancelled) {
        if (!silent && !result.needsConfirmation) showToast("Guardado cancelado.", "error");
        return {
          ok: false,
          cancelled: true,
          needsConfirmation: !!result.needsConfirmation,
          duplicates: result.duplicates,
        };
      }

      const updated = result.data;
      draftReqRef.current = updated;
      setDraftReq(updated);

      if (Array.isArray(updated?.items)) {
        setItems((prev) => mergeItemIds(prev, updated.items));
      }

      if (!silent) {
        const extra = result.forced
          ? " (Confirmaste posible duplicado)"
          : " (Sin duplicados detectados)";
        showToast(`OK.${extra}`, "success");
      }

      return { ok: true, data: updated, forced: !!result.forced, duplicates: result.duplicates };
    } catch (e) {
      console.error("Save falló:", e);
      if (!silent) showToast("No se pudo guardar.", "error");
      return { ok: false, error: "PUT_FAILED" };
    } finally {
      setDraftBusy(false);
    }
  }

  // ✅ Autosave: NO debe sacar confirm; si hay 409 solo avisa una vez
  const autosaveTimerRef = useRef(null);
  const lastSignatureRef = useRef("");
  const dupToastShownRef = useRef(false);

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

  useEffect(() => {
    if (step !== 2) return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    if (!autosaveSignature || autosaveSignature === "INVALID") return;

    const header = buildHeaderPayload();
    if (!header) return;

    if (autosaveSignature === lastSignatureRef.current) return;

    autosaveTimerRef.current = setTimeout(async () => {
      lastSignatureRef.current = autosaveSignature;

      const r = await doSaveAll({ silent: true, interactiveDuplicates: false });

      if (!r.ok && r.needsConfirmation && !dupToastShownRef.current) {
        dupToastShownRef.current = true;
        showToast("⚠️ Posible duplicado detectado. Al guardar se te pedirá confirmación.", "error");
      }

      if (!r.ok && !r.needsConfirmation) {
        lastSignatureRef.current = "";
      }
    }, 500);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveSignature, step]);

  // ====== Finalizar (Guardar) ======
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
      showToast(`Falta información/total válido en los renglones: ${invalidLines.join(", ")}`, "error");
      return;
    }

    try {
      savingRef.current = true;
      setSaving(true);

      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

      const res = await doSaveAll({ silent: true, interactiveDuplicates: true });
      const saved = res?.data;
      const id = saved?.id || draftReqRef.current?.id;

      if (!id) {
        showToast("No se pudo guardar. Intenta de nuevo.", "error");
        return;
      }

      const effectiveNum = requisitionNumber || String(id);
      const dupMsg = res?.forced
        ? "⚠️ Guardada bajo confirmación de posible duplicado."
        : "✅ No se detectaron duplicados en la ventana configurada.";

      showToast(`Requisición #${effectiveNum} guardada correctamente. ${dupMsg}`, "success");
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
            // ✅ tu prop actual
            manualItemsMode={manualItemsMode}
            // ✅ prop extra por compatibilidad (para el warning)
            manualMode={manualItemsMode}
            ackCostRealistic={ackCostRealistic}
            setAckCostRealistic={setAckCostRealistic}
          />

          {/* ✅ Panel Cotizaciones */}
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

          {/* Footer actions */}
          <div className="flex justify-end mt-6 gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="bg-gray-300 hover:bg-gray-400 text-black px-4 py-2 rounded"
              disabled={saving || draftBusy}
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