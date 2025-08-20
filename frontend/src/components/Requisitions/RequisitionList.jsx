// frontend/src/components/Requisitions/RequisitionList.jsx

import React, { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../UI/LoadingSpinner';
import RequisitionCard from './RequisitionCard';

export default function RequisitionList() {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Robust date -> dd/mm/yyyy (no timezone drift)
  const toUTCDate = (value) => {
    if (!value) return null;
    // If it's an ISO date starting with YYYY-MM-DD, parse as UTC date
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
    if (m) {
      const [ , y, mo, d ] = m.map(Number);
      return new Date(Date.UTC(y, mo - 1, d));
    }
    // Fallback to native parse
    const dt = new Date(value);
    return isNaN(dt.getTime()) ? null : dt;
  };

  const formatDMY = (value) => {
    const dt = toUTCDate(value);
    if (!dt) return value ?? '';
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = dt.getUTCFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  useEffect(() => {
    apiClient.get('/requisitions/')
      .then(res => {
        const results = Array.isArray(res.data?.results) ? res.data.results : (Array.isArray(res.data) ? res.data : []);
        // Pre-format date fields to dd/mm/yyyy
        const patched = results.map(r => ({
          ...r,
          // If your card uses `fecha`, this will show dd/mm/yyyy
          fecha: r.fecha ? formatDMY(r.fecha) : r.fecha,
          // If your card uses `created_at`, this will also be dd/mm/yyyy
          created_at: r.created_at ? formatDMY(r.created_at) : r.created_at,
        }));
        setRequisitions(patched);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {requisitions.map(req => (
        <RequisitionCard key={req.id} requisition={req} />
      ))}
    </div>
  );
}
