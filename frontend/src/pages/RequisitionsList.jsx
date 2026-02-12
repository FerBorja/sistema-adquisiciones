// frontend/src/pages/RequisitionsList.jsx
import React, { useEffect, useState, useContext } from 'react';
import apiClient from '../api/apiClient';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Map DB statuses -> Spanish labels (case-insensitive)
const STATUS_LABEL = new Map([
  ['pending', 'Pendiente'],
  ['approved', 'Aprobado'],
  ['registered', 'Registrado'],
  ['completed', 'Completado'],
  ['sent', 'Enviado a Unidad Central'],
  ['received', 'Recibido por Oficina de Administración'],
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

export default function RequisitionsList() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [requisitions, setRequisitions] = useState([]);

  const userRole = user?.role?.toLowerCase() || '';
  const canModify = userRole === 'admin' || userRole === 'superuser';
  const userName = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();

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

  const handleExportPDF = async (id) => {
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

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-300">
          <thead className="bg-indigo-100">
            <tr>
              <th className="px-4 py-2 border">Folio</th>
              <th className="px-4 py-2 border">Fecha</th>
              <th className="px-4 py-2 border">Motivo</th>
              <th className="px-4 py-2 border">Estatus</th>
              <th className="px-4 py-2 border">Imprimir</th>
              {canModify && <th className="px-4 py-2 border">Modificar</th>}
            </tr>
          </thead>

          <tbody>
            {requisitions.length === 0 ? (
              <tr>
                <td colSpan={canModify ? 6 : 5} className="text-center py-4 border-2 border-indigo-300">
                  No hay requisiciones
                </td>
              </tr>
            ) : (
              requisitions.map((req) => {
                const canPrint = req?.ack_cost_realistic === true; // si no viene el campo, queda false
                return (
                  <tr key={req.id} className="even:bg-gray-50 hover:bg-indigo-50 transition-colors">
                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.id}</td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      {req.created_at ? new Date(req.created_at).toLocaleDateString('es-MX') : ''}
                    </td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      {req.requisition_reason}
                    </td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      {displayStatus(req.status)}
                    </td>

                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      <button
                        disabled={!canPrint}
                        className={`px-2 py-1 rounded text-white ${
                          canPrint ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-400 cursor-not-allowed'
                        }`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!canPrint) return;
                          handleExportPDF(req.id);
                        }}
                        title={
                          canPrint
                            ? 'Exportar PDF'
                            : 'Primero confirma: costo aproximado pero realista (en Modificar)'
                        }
                      >
                        PDF
                      </button>

                      {!canPrint && (
                        <div className="text-xs text-red-600 mt-1">
                          Confirma “costo aproximado realista” en Modificar.
                        </div>
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
