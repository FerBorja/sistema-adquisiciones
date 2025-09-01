// frontend/src/pages/RequisitionEdit.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient";
import RequisitionForm from "../components/Requisitions/RequisitionForm";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import { useToast } from "../contexts/ToastContext";

export default function RequisitionEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [requisition, setRequisition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErrorMsg("");

      try {
        const { data } = await apiClient.get(`/requisitions/${id}/`);
        if (!alive) return;
        setRequisition(data);
      } catch (err) {
        if (!alive) return;

        // Basic error handling & friendly messages
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          showToast?.("Sesión expirada o sin permisos. Inicia sesión nuevamente.", "warning");
          navigate("/login");
          return;
        }
        if (status === 404) {
          setErrorMsg("No se encontró la requisición.");
        } else {
          setErrorMsg("Ocurrió un error al cargar la requisición.");
        }
        console.error("GET /requisitions/:id error:", err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, navigate, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow space-y-4">
        <h1 className="text-2xl font-bold">Editar Requisición</h1>
        <p className="text-red-600">{errorMsg}</p>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
          >
            Regresar
          </button>
          <button
            onClick={() => navigate("/requisitions")}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Ir a Requisiciones
          </button>
        </div>
      </div>
    );
  }

  if (!requisition) {
    return (
      <div className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold">Editar Requisición</h1>
        <p className="text-gray-600">No se encontró la requisición.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <RequisitionForm mode="edit" initialData={requisition} />
    </div>
  );
}
