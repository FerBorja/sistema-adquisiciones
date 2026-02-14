// frontend/src/components/Requisitions/RequisitionCard.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const STATUS_LABELS = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  registered: 'Registrado',
  completed: 'Completado',
  sent: 'Enviado a Unidad Central',
  received: 'Recibido por Oficina de Administración',
  cancelled: 'Cancelado',
};

function displayStatus(status) {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_LABELS[key] ?? (status ? String(status) : '—');
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-MX');
  } catch {
    return String(iso || '—');
  }
}

export default function RequisitionCard({ requisition }) {
  const title = requisition?.title || `Requisición #${requisition?.id ?? '—'}`;

  return (
    <div className="border rounded p-4 shadow hover:shadow-md transition duration-200">
      <Link
        to={`/requisitions/${requisition.id}`}
        className="text-blue-600 font-semibold hover:underline"
      >
        {title}
      </Link>

      <p className="text-sm text-gray-600 mt-1">
        <strong>Estatus:</strong> {displayStatus(requisition.status)}
      </p>

      {requisition.created_at && (
        <p className="text-xs text-gray-400 mt-1">
          <strong>Creado:</strong> {formatDate(requisition.created_at)}
        </p>
      )}
    </div>
  );
}
