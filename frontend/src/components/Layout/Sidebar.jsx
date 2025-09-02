// frontend/src/components/Layout/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { AuthContext } from "../../contexts/AuthContext";

function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block px-3 py-2 rounded-lg transition ${
          isActive ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-100"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user } = React.useContext(AuthContext);

  const isAdminish =
    user?.role === "admin" ||
    user?.role === "superuser" ||
    user?.is_staff === true ||
    user?.is_superuser === true;

  return (
    <aside className="w-full md:w-64 bg-white border-r">
      <div className="p-4">
        <h2 className="text-xs font-semibold text-gray-500 tracking-wide mb-2">
          COMPRAS
        </h2>
        <div className="space-y-1">
          <NavItem to="/requisitions/new">Registro</NavItem>
          <NavItem to="/requisitions">Consulta | Autorizaciones</NavItem>

          {isAdminish && <NavItem to="/reports">Reportes</NavItem>}
        </div>
      </div>
    </aside>
  );
}
