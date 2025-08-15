// frontend/src/pages/RequisitionsList.jsx
import React from 'react';
import RequisitionList from '../components/Requisitions/RequisitionList';

export default function RequisitionsListPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold text-gray-700 mb-6">Requisitions List</h1>
      <RequisitionList />
    </div>
  );
}
