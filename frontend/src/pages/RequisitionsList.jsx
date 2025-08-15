// frontend/src/pages/RequisitionsList.jsx
import React, { useEffect, useState, useContext } from 'react';
import apiClient from '../api/apiClient';
import { AuthContext } from '../contexts/AuthContext';

export default function RequisitionsList() {
  const { user } = useContext(AuthContext);
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
                  colSpan={canModify ? 6 : 5} // Adjusted colspan
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
                    {new Date(req.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.requisition_reason}</td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">{req.status || 'Pendiente'}</td>
                  <td className="px-4 py-2 border-2 border-indigo-300 text-center">
                    <button
                      className="px-2 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      onClick={async () => {
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
                      <button className="px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                        Modificar
                      </button>
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
