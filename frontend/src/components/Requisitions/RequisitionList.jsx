// frontend/src/components/Requisitions/RequisitionList.jsx

import React, { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';
import { Link } from 'react-router-dom';
import LoadingSpinner from '../UI/LoadingSpinner';
import RequisitionCard from './RequisitionCard';

export default function RequisitionList() {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/requisitions/')
      .then(res => {
        console.log('Requisitions API response:', res.data);
        setRequisitions(res.data.results);
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
