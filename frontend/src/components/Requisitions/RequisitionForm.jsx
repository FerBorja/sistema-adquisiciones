import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';

export default function RequisitionForm() {
  const navigate = useNavigate();
  const [catalogs, setCatalogs] = useState({
    departments: [],
    projects: [],
    categories: [],
  });
  const [formData, setFormData] = useState({
    department: '',
    project: '',
    category: '',
    description: '',
  });

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
    .catch(err => console.error('Error loading catalogs:', err));
  }, []);

  const handleChange = (e) => {
    setFormData({...formData, [e.target.name]: e.target.value});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    apiClient.post('/requisitions/', formData)
      .then(() => navigate('/requisitions'))
      .catch(err => console.error('Error creating requisition:', err));
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">New Requisition</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Department */}
        <select name="department" value={formData.department} onChange={handleChange} className="border p-2 w-full">
          <option value="">Select Department</option>
          {catalogs.departments.map(dep => (
            <option key={dep.id} value={dep.id}>{dep.name}</option>
          ))}
        </select>

        {/* Project */}
        <select name="project" value={formData.project} onChange={handleChange} className="border p-2 w-full">
          <option value="">Select Project</option>
          {catalogs.projects.map(proj => (
            <option key={proj.id} value={proj.id}>{proj.name}</option>
          ))}
        </select>

        {/* Category */}
        <select name="category" value={formData.category} onChange={handleChange} className="border p-2 w-full">
          <option value="">Select Category</option>
          {catalogs.categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>

        {/* Description */}
        <textarea
          name="description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Requisition description"
          className="border p-2 w-full"
        />

        {/* Submit */}
        <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">
          Create
        </button>
      </form>
    </div>
  );
}
