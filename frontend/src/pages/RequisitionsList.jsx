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

export default function RequisitionsList() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [requisitions, setRequisitions] = useState([]);

  const userRole = user?.role?.toLowerCase() || '';
  const canModify = userRole === 'admin' || userRole === 'superuser';
  const userName = `${user?.first_name} ${user?.last_name}`;

  useEffect(() => {
    const fetchRequisitions = async () => {
      try {
        const response = await apiClient.get('/requisitions/');
        // API returns {count, next, previous, results}
        setRequisitions(response.data.results || []);
      } catch (err) {
        console.error(err);
        setRequisitions([]);
      }
    };

    fetchRequisitions();
  }, []);

  // Local action button using navigate()
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

  return (
    <div className="flex flex-col">
      {/* Header texts */}
      <h1 className="text-xl font-semibold mb-2">
        Favor de imprimir, firmar y entregar su requisición en Fecha y Hora establecidas en Secretaría Administrativa
      </h1>
      <p className="mb-2">
        Listado de Requisición del Usuario : <span className="font-bold">{userName}</span>
      </p>
      <p className="text-red-600 font-bold mb-4">
        * Nota: Las solicitudes una vez autorizadas no pueden ser modificadas por el usuario.
      </p>

      {/* Table */}
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
                <td
                  colSpan={canModify ? 6 : 5}
                  className="text-center py-4 border-2 border-indigo-300"
                >
                  No hay requisiciones
                </td>
              </tr>
            ) : (
              requisitions.map((req) => (
                <tr
                  key={req.id}
                  className="even:bg-gray-50 hover:bg-indigo-50 transition-colors"
                >
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.id}</td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                    {new Date(req.created_at).toLocaleDateString('es-MX')}
                  </td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.requisition_reason}</td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                    {displayStatus(req.status)}
                  </td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                    <button
                      className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const token = localStorage.getItem('token'); // get JWT
                          const response = await fetch(`http://localhost:8000/api/requisitions/${req.id}/export_pdf/`, {
                            headers: { Authorization: `Bearer ${token}` },
                          });

                          if (!response.ok) throw new Error('Error generating PDF');

                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);

                          // Open in new tab
                          const pdfWindow = window.open();
                          pdfWindow.location.href = url;
                        } catch (err) {
                          console.error(err);
                          alert('No se pudo generar el PDF');
                        }
                      }}
                    >
                      PDF
                    </button>
                  </td>
                  {canModify && (
                    <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                      <ModifyButton id={req.id} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
