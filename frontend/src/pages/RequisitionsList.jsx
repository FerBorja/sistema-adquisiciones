// frontend/src/pages/RequisitionsList.jsx
import React, { useEffect, useState, useContext, useMemo } from 'react';
import apiClient from '../api/apiClient';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { PDFDocument } from 'pdf-lib';

// Map DB statuses -> Spanish labels (case-insensitive)
const STATUS_LABEL = new Map([
  ['pending', 'Pendiente'],
  ['approved', 'Aprobado'],
  ['registered', 'Registrado'],
  ['completed', 'Completado'],
  ['sent', 'Enviado a Unidad Central'],
  ['received', 'Recibido por Oficina de Administración'],
  ['cancelled', 'Cancelado'],
]);

const displayStatus = (value) => {
  if (!value) return 'Pendiente';
  const key = String(value).trim().toLowerCase();
  return STATUS_LABEL.get(key) ?? value;
};

async function readErrorMessage(res) {
  const ct = (res.headers.get('content-type') || '').toLowerCase();

  // 1) Intenta JSON
  if (ct.includes('application/json')) {
    try {
      const data = await res.json();
      if (typeof data === 'string') return data;
      if (data?.detail) return data.detail;
      return JSON.stringify(data, null, 2);
    } catch (e) {
      // si falla json(), caemos a texto
    }
  }

  // 2) Texto plano
  try {
    const text = await res.text();
    return text || 'Error desconocido (sin body).';
  } catch (e) {
    return 'Error desconocido (no se pudo leer la respuesta).';
  }
}

// Duplica páginas: 1,1,2,2,3,3...
async function duplicatePdfPages(pdfBytes) {
  const original = await PDFDocument.load(pdfBytes);
  const out = await PDFDocument.create();

  const indices = original.getPageIndices();
  for (const idx of indices) {
    const [p1] = await out.copyPages(original, [idx]);
    out.addPage(p1);
    const [p2] = await out.copyPages(original, [idx]);
    out.addPage(p2);
  }

  return await out.save();
}

// Imprime un PDF (bytes) sin descargar: crea iframe invisible y llama print()
async function printPdfBytes(pdfBytes) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;

  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {}
    URL.revokeObjectURL(url);
  };

  // Nota: algunos navegadores tardan en cargar el PDF dentro del iframe
  iframe.onload = () => {
    const w = iframe.contentWindow;
    if (!w) {
      cleanup();
      return;
    }

    // Limpieza cuando termine la impresión (si el navegador lo soporta)
    w.onafterprint = () => cleanup();

    // Dispara print con una pequeña espera para asegurar render del PDF
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } catch (e) {
        cleanup();
      }
    }, 250);

    // Fallback de limpieza por si onafterprint no dispara
    setTimeout(() => cleanup(), 15000);
  };
}

export default function RequisitionsList() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [requisitions, setRequisitions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const userRole = user?.role?.toLowerCase() || '';
  const canModify = userRole === 'admin' || userRole === 'superuser';
  const userName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();

  // ---- Helpers para búsqueda (tolerante a acentos / mayúsculas / fechas) ----
  const normalize = (v) =>
    (v ?? '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim();

  const dateVariants = (value) => {
    if (!value) return [''];
    const raw = String(value);

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return [raw];

    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();

    // Incluye varias formas comunes
    return [raw, `${dd}/${mm}/${yyyy}`, `${dd}-${mm}-${yyyy}`, `${yyyy}-${mm}-${dd}`];
  };

  useEffect(() => {
    const fetchRequisitions = async () => {
      try {
        const response = await apiClient.get('/requisitions/');
        setRequisitions(response.data.results || []);
      } catch (err) {
        console.error(err);
        setRequisitions([]);
      }
    };

    fetchRequisitions();
  }, []);

  const ModifyButton = ({ id }) => {
    const goEdit = (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigate(`/requisitions/edit/${id}`);
    };
    return (
      <button
        type="button"
        onClick={goEdit}
        className="inline-flex items-center px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
      >
        Modificar
      </button>
    );
  };

  // Descarga el PDF (como antes)
  const handleDownloadPDF = async (id) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('No se encontró token. Inicia sesión de nuevo.');
        return;
      }

      const url = `http://localhost:8000/api/requisitions/${id}/export_pdf/`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/pdf,application/json;q=0.9,*/*;q=0.8',
        },
      });

      if (!res.ok) {
        const msg = await readErrorMessage(res);
        console.error('PDF error:', res.status, msg);
        alert(`Error ${res.status}:\n${msg}`);
        return;
      }

      const blob = await res.blob();
      const fileURL = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = fileURL;
      a.download = `requisicion_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(fileURL);
    } catch (err) {
      console.error(err);
      alert('No se pudo generar el PDF (error inesperado).');
    }
  };

  // Imprime directamente con páginas duplicadas (sin descargar)
  const handlePrintDuplicatedPDF = async (id) => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('No se encontró token. Inicia sesión de nuevo.');
        return;
      }

      const url = `http://localhost:8000/api/requisitions/${id}/export_pdf/`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/pdf,application/json;q=0.9,*/*;q=0.8',
        },
      });

      if (!res.ok) {
        const msg = await readErrorMessage(res);
        console.error('PDF error:', res.status, msg);
        alert(`Error ${res.status}:\n${msg}`);
        return;
      }

      const originalBytes = await res.arrayBuffer();
      const duplicatedBytes = await duplicatePdfPages(originalBytes);

      await printPdfBytes(duplicatedBytes);
    } catch (err) {
      console.error(err);
      alert('No se pudo imprimir el PDF (error inesperado).');
    }
  };

  // ---- Búsqueda global (folio/id, fecha, motivo, estatus) ----
  const filteredRequisitions = useMemo(() => {
    const q = normalize(searchTerm);
    if (!q) return requisitions ?? [];

    const tokens = q.split(/\s+/).filter(Boolean);

    return (requisitions ?? []).filter((r) => {
      const statusLabel = displayStatus(r.status);

      const parts = [
        r.id, // folio mostrado en tabla actualmente
        ...(dateVariants(r.created_at)),
        r.requisition_reason,
        r.status, // "completed"
        statusLabel, // "Completado"
      ];

      const haystack = normalize(parts.join(' '));
      return tokens.every((t) => haystack.includes(t));
    });
  }, [requisitions, searchTerm]);

  return (
    <div className="flex flex-col">
      <h1 className="text-xl font-semibold mb-2">
        Favor de imprimir, firmar y entregar su requisición en Fecha y Hora establecidas en Secretaría Administrativa
      </h1>
      <p className="mb-2">
        Listado de Requisición del Usuario : <span className="font-bold">{userName}</span>
      </p>
      <p className="text-red-600 font-bold mb-4">
        * Nota: Las solicitudes una vez autorizadas no pueden ser modificadas por el usuario.
      </p>

      {/* Buscador */}
      <div className="flex items-center gap-3 my-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por folio, fecha, motivo, estatus..."
          className="w-[420px] px-3 py-2 border rounded"
        />

        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="px-3 py-2 border rounded bg-white" type="button">
            Limpiar
          </button>
        )}

        <div className="ml-auto text-sm opacity-70">
          Mostrando {filteredRequisitions.length} de {(requisitions ?? []).length}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300">
          <thead className="bg-indigo-100">
            <tr>
              <th className="px-4 py-2 border">Folio</th>
              <th className="px-4 py-2 border">Fecha</th>
              <th className="px-4 py-2 border">Motivo</th>
              <th className="px-4 py-2 border">Estatus</th>
              <th className="px-4 py-2 border">Exportar</th>
              {canModify && <th className="px-4 py-2 border">Modificar</th>}
            </tr>
          </thead>

          <tbody>
            {filteredRequisitions.length === 0 ? (
              <tr>
                <td colSpan={canModify ? 6 : 5} className="text-center py-4 border-2 border-indigo-300">
                  {searchTerm ? 'No hay coincidencias' : 'No hay requisiciones'}
                </td>
              </tr>
            ) : (
              filteredRequisitions.map((req) => {
                const canPrint = req?.ack_cost_realistic === true; // si no viene el campo, queda false
                return (
                  <tr key={req.id} className="even:bg-gray-50 hover:bg-indigo-50 transition-colors">
                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.id}</td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString('es-MX') : ''}
                    </td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.requisition_reason}</td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">{displayStatus(req.status)}</td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* PDF (descarga) */}
                        <button
                          disabled={!canPrint}
                          className={`px-2 py-1 rounded text-white ${
                            canPrint ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!canPrint) return;
                            handleDownloadPDF(req.id);
                          }}
                          title={canPrint ? 'Descargar PDF' : 'Primero confirma: costo aproximado realista (en Modificar)'}
                          type="button"
                        >
                          PDF
                        </button>

                        {/* Imprimir (sin descargar, duplicando páginas) */}
                        <button
                          disabled={!canPrint}
                          className={`px-2 py-1 rounded text-white ${
                            canPrint ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-400 cursor-not-allowed'
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!canPrint) return;
                            handlePrintDuplicatedPDF(req.id);
                          }}
                          title={
                            canPrint
                              ? 'Imprimir 2 copias (páginas duplicadas)'
                              : 'Primero confirma: costo aproximado realista (en Modificar)'
                          }
                          type="button"
                        >
                          Imprimir
                        </button>
                      </div>

                      {!canPrint && (
                        <div className="text-xs text-red-600 mt-1">Confirma “costo aproximado realista” en Modificar.</div>
                      )}
                    </td>

                    {canModify && (
                      <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                        <ModifyButton id={req.id} />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}