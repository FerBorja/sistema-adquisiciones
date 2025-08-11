import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/apiClient';

export default function RequisitionList() {
  const [requisitions, setRequisitions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/requisitions/')
      .then((res) => {
        console.log('Requisitions API response:', res.data);
        setRequisitions(res.data.results);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching requisitions:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="p-4">Loading...</p>;

  // Defensive check:
  if (!Array.isArray(requisitions) || requisitions.length === 0) {
    return <p className="p-4">No requisitions found.</p>;
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Requisitions</h1>
      <Link to="/requisitions/new" className="bg-blue-500 text-white px-4 py-2 rounded">+ New</Link>
      <ul className="mt-4 space-y-2">
        {requisitions.map((req) => (
          <li key={req.id} className="border p-2 rounded">
            <Link to={`/requisitions/${req.id}`} className="text-blue-600 hover:underline">
              {req.title || `Requisition #${req.id}`}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
