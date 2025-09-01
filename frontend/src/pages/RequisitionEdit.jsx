import React from "react";
import { useParams } from "react-router-dom";

export default function RequisitionEdit() {
  const { id } = useParams();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Editar Requisición</h1>
      <p>Folio: <strong>{id}</strong></p>
      <p className="text-gray-600 mt-2">Página de edición (vacía por ahora).</p>
    </div>
  );
}
