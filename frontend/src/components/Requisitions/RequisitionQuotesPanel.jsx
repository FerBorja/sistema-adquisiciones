import React, { useEffect, useMemo, useRef, useState } from "react";
import apiClient from "../../api/apiClient";

const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function isPdfFile(file) {
  if (!file) return false;
  const name = (file.name || "").toLowerCase();
  return name.endsWith(".pdf");
}

function isRealId(v) {
  const n = Number(v);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

export default function RequisitionQuotesPanel({ requisitionId, items, onDraftInvalidChange }) {
  const fileInputRef = useRef(null);

  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);

  const [draftFile, setDraftFile] = useState(null);
  const [draftItemIds, setDraftItemIds] = useState(new Set());
  const [busyUpload, setBusyUpload] = useState(false);

  const hasItems = Array.isArray(items) && items.length > 0;

  // Map: requisition_item_id -> quote_id
  const quotedItemIdToQuoteId = useMemo(() => {
    const map = new Map();
    (quotes || []).forEach((q) => {
      (q.items || []).forEach((it) => {
        if (isRealId(it?.id)) map.set(String(it.id), q.id);
      });
    });
    return map;
  }, [quotes]);

  const quotableItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items.filter((it) => {
      const id = it?.id;
      if (!isRealId(id)) return false;
      const alreadyQuote = quotedItemIdToQuoteId.get(String(id));
      return !alreadyQuote;
    });
  }, [items, quotedItemIdToQuoteId]);

  const hasQuotableItems = quotableItems.length > 0;

  // "incompleto" solo si: hay archivo + 0 seleccionados + existe al menos 1 opción cotizable
  const draftIncomplete = Boolean(draftFile) && draftItemIds.size === 0 && hasQuotableItems;

  useEffect(() => {
    onDraftInvalidChange?.(draftIncomplete);
  }, [draftIncomplete, onDraftInvalidChange]);

  function clearDraft() {
    setDraftFile(null);
    setDraftItemIds(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
    onDraftInvalidChange?.(false);
  }

  async function refresh() {
    if (!requisitionId) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/requisitions/${requisitionId}/quotes/`);
      setQuotes(res.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId]);

  const onPickFile = (file) => {
    if (!file) {
      clearDraft();
      return;
    }
    if (!hasItems) {
      window.alert("Primero registra al menos una partida para poder subir cotizaciones.");
      clearDraft();
      return;
    }

    // ✅ si no hay partidas cotizables, no dejes al usuario atorarse con un archivo
    if (!hasQuotableItems) {
      window.alert(
        "No hay partidas disponibles para cotizar.\n\n" +
          "- Si acabas de agregar una partida nueva: guarda cambios para que reciba ID.\n" +
          "- Si todas ya están cotizadas: elimina una cotización si necesitas reemplazarla."
      );
      clearDraft();
      return;
    }

    if (!isPdfFile(file)) {
      window.alert("Solo se permiten archivos .pdf");
      clearDraft();
      return;
    }
    if (file.size > MAX_BYTES) {
      window.alert(`El archivo excede ${MAX_MB} MB.`);
      clearDraft();
      return;
    }

    setDraftFile(file);
    setDraftItemIds(new Set()); // selección explícita
  };

  const toggleItem = (id) => {
    const key = String(id);
    setDraftItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const upload = async () => {
    if (!hasItems) {
      window.alert("Primero registra al menos una partida.");
      return;
    }
    if (!draftFile) {
      window.alert("Selecciona un PDF.");
      return;
    }

    const ids = Array.from(draftItemIds)
      .map((x) => Number(x))
      .filter((x) => isRealId(x));

    if (ids.length === 0) {
      window.alert("Selecciona al menos una partida válida para esta cotización.");
      return;
    }

    setBusyUpload(true);
    try {
      const fd = new FormData();
      fd.append("file", draftFile);

      // ✅ repetir item_ids para DRF getlist()
      ids.forEach((id) => fd.append("item_ids", String(id)));

      await apiClient.post(`/requisitions/${requisitionId}/quotes/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      clearDraft();
      await refresh();
      window.alert("Cotización subida correctamente.");
    } catch (err) {
      const data = err?.response?.data;
      window.alert(`No se pudo subir la cotización.\n\n${data ? JSON.stringify(data, null, 2) : err?.message || ""}`);
    } finally {
      setBusyUpload(false);
    }
  };

  const removeQuote = async (quoteId) => {
    if (!window.confirm("¿Eliminar esta cotización?")) return;
    try {
      await apiClient.delete(`/requisitions/${requisitionId}/quotes/${quoteId}/`);
      await refresh();
    } catch (err) {
      const data = err?.response?.data;
      window.alert(`No se pudo eliminar.\n\n${data ? JSON.stringify(data, null, 2) : err?.message || ""}`);
    }
  };

  return (
    <div className="mt-6 border rounded p-4 bg-slate-50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Cotizaciones (PDF)</h3>
        {loading ? <span className="text-xs text-gray-600">Cargando…</span> : null}
      </div>

      {!hasItems ? (
        <div className="mt-2 text-sm text-gray-700">Para subir cotizaciones, primero registra al menos una partida.</div>
      ) : (
        <>
          <div className="mt-3 grid md:grid-cols-3 gap-3 items-start">
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Archivo (PDF, ≤ {MAX_MB}MB)</label>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
              />

              {draftFile ? (
                <div className="text-xs text-gray-700 mt-2">
                  <div>
                    <b>Seleccionado:</b> {draftFile.name}
                  </div>
                  <div>
                    <b>Tamaño:</b> {(draftFile.size / (1024 * 1024)).toFixed(2)} MB
                  </div>

                  <button
                    type="button"
                    onClick={clearDraft}
                    className="mt-2 px-2 py-1 rounded border text-xs bg-white hover:bg-gray-50"
                  >
                    Quitar archivo
                  </button>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <div className="text-xs font-medium text-gray-700 mb-1">Partidas incluidas en esta cotización (elige ≥ 1)</div>

              <div className="border rounded bg-white p-2 max-h-44 overflow-auto">
                {(items || []).map((it, idx) => {
                  const id = it?.id;
                  const hasId = isRealId(id);
                  const key = hasId ? String(id) : `tmp-${idx}`;

                  const alreadyQuote = hasId ? quotedItemIdToQuoteId.get(String(id)) : null;
                  const disabled = !hasId || Boolean(alreadyQuote);

                  const title = !hasId
                    ? "No se puede cotizar hasta que tenga ID (guarda cambios)."
                    : alreadyQuote
                      ? `Esta partida ya tiene cotización (#${alreadyQuote}).`
                      : "";

                  return (
                    <label key={key} className="flex items-start gap-2 text-sm py-1">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={hasId ? draftItemIds.has(String(id)) : false}
                        onChange={() => hasId && toggleItem(id)}
                        title={title}
                      />
                      <span>
                        {hasId ? (
                          <>
                            <b>Item #{id}</b> <span className="text-gray-600">(total: {it.estimated_total ?? "—"})</span>
                          </>
                        ) : (
                          <>
                            <b>Item (pendiente de guardar)</b>{" "}
                            <span className="text-gray-600">(total: {it.estimated_total ?? "—"})</span>
                            <span className="ml-2 text-xs text-red-700">No se puede cotizar hasta que tenga ID (guarda cambios).</span>
                          </>
                        )}

                        {alreadyQuote ? <span className="ml-2 text-xs text-amber-700">Ya cotizado (#{alreadyQuote})</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>

              {!hasQuotableItems ? (
                <div className="mt-2 text-xs text-amber-800">
                  No hay partidas cotizables por ahora. Si agregaste una partida nueva, guarda cambios para que reciba ID.
                </div>
              ) : null}

              {draftIncomplete ? (
                <div className="mt-2 text-xs text-red-700">Debes seleccionar al menos una partida para poder guardar esta cotización.</div>
              ) : null}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={busyUpload || !draftFile}
                  onClick={upload}
                  className={`px-4 py-2 rounded text-white ${busyUpload || !draftFile ? "bg-slate-300" : "bg-slate-700 hover:bg-slate-800"}`}
                >
                  {busyUpload ? "Subiendo…" : "Subir cotización"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Cotizaciones subidas</h4>
            {quotes.length === 0 ? (
              <div className="text-sm text-gray-600">No hay cotizaciones (opcional).</div>
            ) : (
              <div className="border rounded bg-white overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left">Archivo</th>
                      <th className="px-2 py-2 text-center">Tamaño</th>
                      <th className="px-2 py-2 text-center"># Partidas</th>
                      <th className="px-2 py-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q) => (
                      <tr key={q.id} className="border-t">
                        <td className="px-2 py-2">
                          {q.file_url ? (
                            <a className="text-blue-700 underline" href={q.file_url} target="_blank" rel="noreferrer">
                              {q.original_name || `Cotización #${q.id}`}
                            </a>
                          ) : (
                            q.original_name || `Cotización #${q.id}`
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {q.size_bytes ? (q.size_bytes / (1024 * 1024)).toFixed(2) + " MB" : "—"}
                        </td>
                        <td className="px-2 py-2 text-center">{(q.items || []).length}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                            onClick={() => removeQuote(q.id)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
