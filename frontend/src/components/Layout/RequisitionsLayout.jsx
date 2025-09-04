// frontend/src/components/Layout/RequisitionsLayout.jsx
import React from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function RequisitionsLayout() {
  const location = useLocation();

  // Default link style
  const linkClass = (isActive) =>
    `px-3 py-2 rounded ${isActive ? "bg-indigo-600 text-white" : "hover:bg-gray-100"}`;

  // Exact style for the base /requisitions route
  const exactIsActiveForBase = location.pathname === "/requisitions";

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <aside className="w-64 border-r p-4">
          <h2 className="text-xs font-semibold text-gray-500 mb-2">COMPRAS</h2>
          <nav className="flex flex-col gap-2">
            <NavLink
              to="/requisitions/new"
              className={({ isActive }) => linkClass(isActive)}
            >
              Registro
            </NavLink>

            {/* ✅ exact match only */}
            <NavLink
              to="/requisitions"
              end
              className={() => linkClass(exactIsActiveForBase)}
            >
              Consulta | Autorizaciones
            </NavLink>

            <NavLink
              to="/reports"
              className={({ isActive }) => linkClass(isActive)}
            >
              Reportes
            </NavLink>
          </nav>
        </aside>

        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <Footer />
    </div>
  );
}
