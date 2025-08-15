// frontend/src/components/Layout/Sidebar.jsx
import React from 'react';
import { NavLink } from 'react-router-dom';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-indigo-50 border-r border-indigo-200 min-h-screen p-6">
      <h2 className="text-2xl font-semibold text-indigo-700 mb-6">Adquisiciones</h2>
      <nav className="flex flex-col gap-3">
        <NavLink
          to="/requisitions/new"
          className={({ isActive }) =>
            `px-4 py-2 rounded font-semibold transition-all ${
              isActive
                ? 'bg-indigo-600 text-white shadow-lg border-l-4 border-indigo-800'
                : 'text-indigo-700 hover:bg-indigo-100'
            }`
          }
        >
          Registro
        </NavLink>

        <NavLink
          to="/requisitions"
          end
          className={({ isActive }) =>
            `px-4 py-2 rounded font-semibold transition-all ${
              isActive
                ? 'bg-indigo-600 text-white shadow-lg border-l-4 border-indigo-800'
                : 'text-indigo-700 hover:bg-indigo-100'
            }`
          }
        >
          Consulta | Autorizaciones
        </NavLink>
      </nav>
    </aside>
  );
}
