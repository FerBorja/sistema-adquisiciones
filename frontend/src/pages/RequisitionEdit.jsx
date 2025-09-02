// frontend/src/pages/RequisitionEdit.jsx
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/apiClient";
import LoadingSpinner from "../components/UI/LoadingSpinner";
import RequisitionEditWizard from "../components/Requisitions/RequisitionEditWizard";

export default function RequisitionEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const resp = await apiClient.get(`/requisitions/${id}/`);
        if (!cancelled) setData(resp.data);
      } catch (e) {
        console.error(e);
        alert("No se pudo cargar la requisición.");
        navigate("/requisitions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const handleSaved = (updated) => {
    // Optional: update state while on page
    setData(updated);
    // ✅ After save, go back to the requisition list
    navigate("/requisitions");
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-4 md:p-6">
      <RequisitionEditWizard requisition={data} onSaved={handleSaved} />
    </div>
  );
}
