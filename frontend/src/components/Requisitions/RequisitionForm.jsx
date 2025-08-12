import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useToast } from '../../contexts/ToastContext';

export default function RequisitionForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Catalogs for dropdowns
  const [catalogs, setCatalogs] = useState({
    departments: [],
    projects: [],
    categories: [],
  });

  const [formData, setFormData] = useState({
    department: '',
    project: '',
    category: '',
    title: '',
    description: '',
    quantity: 1,
  });

  const [loading, setLoading] = useState(false);

  // Fetch catalogs for dropdowns
  useEffect(() => {
    Promise.all([
      apiClient.get('/catalogs/departments/'),
      apiClient.get('/catalogs/projects/'),
      apiClient.get('/catalogs/categories/'),
    ])
      .then(([depRes, projRes, catRes]) => {
        setCatalogs({
          departments: depRes.data,
          projects: projRes.data,
          categories: catRes.data,
        });
      })
      .catch(err => {
        console.error('Error loading catalogs:', err);
        showToast('Failed to load catalogs.', 'error');
      });
  }, [showToast]);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await apiClient.post('/requisitions/', formData);
      showToast('Requisition created successfully!', 'success');

      // Reset form to initial empty state
      setFormData({
        department: '',
        project: '',
        category: '',
        title: '',
        description: '',
        quantity: 1,
      });

      navigate('/requisitions');
    } catch (err) {
      console.error('Error creating requisition:', err);
      showToast('Failed to create requisition.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="max-w-lg mx-auto bg-white p-6 rounded-lg shadow space-y-4"
    >
      <h2 className="text-2xl font-semibold mb-4">Create Requisition</h2>

      {/* Department */}
      <label className="block mb-1 font-medium">Department</label>
      <select
        name="department"
        value={formData.department}
        onChange={handleChange}
        className="border p-2 w-full rounded"
        required
      >
        <option value="">Select Department</option>
        {catalogs.departments.map(dep => (
          <option key={dep.id} value={dep.id}>{dep.name}</option>
        ))}
      </select>

      {/* Project */}
      <label className="block mb-1 font-medium">Project</label>
      <select
        name="project"
        value={formData.project}
        onChange={handleChange}
        className="border p-2 w-full rounded"
        required
      >
        <option value="">Select Project</option>
        {catalogs.projects.map(proj => (
          <option key={proj.id} value={proj.id}>{proj.name}</option>
        ))}
      </select>

      {/* Category */}
      <label className="block mb-1 font-medium">Category</label>
      <select
        name="category"
        value={formData.category}
        onChange={handleChange}
        className="border p-2 w-full rounded"
        required
      >
        <option value="">Select Category</option>
        {catalogs.categories.map(cat => (
          <option key={cat.id} value={cat.id}>{cat.name}</option>
        ))}
      </select>

      {/* Title */}
      <label className="block mb-1 font-medium">Title</label>
      <input
        type="text"
        name="title"
        value={formData.title}
        onChange={handleChange}
        className="border p-2 w-full rounded"
        required
      />

      {/* Description */}
      <label className="block mb-1 font-medium">Description</label>
      <textarea
        name="description"
        value={formData.description}
        onChange={handleChange}
        className="border p-2 w-full rounded"
      />

      {/* Quantity */}
      <label className="block mb-1 font-medium">Quantity</label>
      <input
        type="number"
        name="quantity"
        value={formData.quantity}
        onChange={handleChange}
        min="1"
        className="border p-2 w-full rounded"
      />

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded disabled:opacity-50"
      >
        {loading ? <LoadingSpinner /> : 'Submit'}
      </button>
    </form>
  );
}
