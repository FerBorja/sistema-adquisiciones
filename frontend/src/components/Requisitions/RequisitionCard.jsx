// frontend/src/components/Requisitions/RequisitionCard.jsx

import React from 'react';
import { Link } from 'react-router-dom';

export default function RequisitionCard({ requisition }) {
  return (
    <div className="border rounded p-4 shadow hover:shadow-md transition duration-200">
      <Link to={`/requisitions/${requisition.id}`} className="text-blue-600 font-semibold hover:underline">
        {requisition.title || `Requisition #${requisition.id}`}
      </Link>
      {requisition.status && (
        <p className="text-sm text-gray-600 mt-1">Status: {requisition.status}</p>
      )}
      {requisition.created_at && (
        <p className="text-xs text-gray-400 mt-1">
          Created: {new Date(requisition.created_at).toLocaleDateString('es-MX')}
        </p>
      )}
    </div>
  );
}
