// frontend/src/components/Layout/RequisitionsLayout.jsx
import React, { useContext } from "react";
import { Outlet, NavLink } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { AuthContext } from "../../contexts/AuthContext";

export default function RequisitionsLayout() {
  const { user } = useContext(AuthContext);
  const isAdmin =
    user?.is_superuser || user?.is_staff || ["admin", "superuser"].includes(user?.role);

  // Helper que recibe { isActive } (objeto) de NavLink v6
  const linkClasses = ({ isActive }) =>
    `px-3 py-2 rounded ${isActive ? "bg-indigo-600 text-white" : "hover:bg-gray-100"}`;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex flex-1">
        <aside className="w-64 border-r p-4">
          <h2 className="text-xs font-semibold text-gray-500 mb-2">COMPRAS</h2>
          <nav className="flex flex-col gap-2">
            <NavLink to="/requisitions/new" className={linkClasses}>
              Registro
            </NavLink>

            {/* match exacto para /requisitions */}
            <NavLink to="/requisitions" end className={linkClasses}>
              Consulta | Autorizaciones
            </NavLink>

            {isAdmin && (
              <NavLink to="/reports" className={linkClasses}>
                Reportes
              </NavLink>
            )}
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
