// frontend/src/pages/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import apiClient from "../api/apiClient";

function DownloadButton({ title, endpoint }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await apiClient.get(endpoint, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      console.error(e);
      alert("No se pudo generar el PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
      disabled={downloading}
      title={endpoint}
    >
      {downloading ? "Generando…" : title}
    </button>
  );
}

function DataTable({ title, columns, rows, emptyText = "Sin datos" }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              {columns.map((c) => (
                <th key={c.key} className="py-2 pr-4 font-semibold">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-3 text-gray-500" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b last:border-b-0">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 pr-4 align-top">
                      {typeof c.render === "function" ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Reports() {
  // Filters for month+unit report
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [byUnit, setByUnit] = useState([]);
  const [byMonthUnit, setByMonthUnit] = useState([]);
  const [byCategory, setByCategory] = useState([]);

  const loadByUnit = async () => {
    try {
      const res = await apiClient.get("/reports/by-unit/");
      setByUnit(res.data || []);
    } catch (e) {
      console.error(e);
      setByUnit([]);
    }
  };

  const loadByMonthUnit = async () => {
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await apiClient.get("/reports/by-month-unit/", { params });
      setByMonthUnit(res.data || []);
    } catch (e) {
      console.error(e);
      setByMonthUnit([]);
    }
  };

  const loadByCategory = async () => {
    try {
      const res = await apiClient.get("/reports/by-category/");
      setByCategory(res.data || []);
    } catch (e) {
      console.error(e);
      setByCategory([]);
    }
  };

  useEffect(() => {
    loadByUnit();
    loadByCategory();
  }, []);

  useEffect(() => {
    loadByMonthUnit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const unitCols = useMemo(
    () => [
      { key: "administrative_unit", header: "Unidad Administrativa" },
      { key: "total", header: "Total" },
    ],
    []
  );

  const monthUnitCols = useMemo(
    () => [
      { key: "month", header: "Mes (YYYY-MM)" },
      { key: "administrative_unit", header: "Unidad Administrativa" },
      { key: "total", header: "Total" },
    ],
    []
  );

  const categoryCols = useMemo(
    () => [
      { key: "category__name", header: "Categoría" },
      { key: "total", header: "Total" },
    ],
    []
  );

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-gray-600">
            Panel de reportes para administradores y superusuarios.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DownloadButton
            title="PDF Resumen (por Unidad)"
            endpoint="/reports/summary-pdf/"
          />
          <DownloadButton
            title="PDF Requisiciones (detalle)"
            endpoint="/reports/requisitions-report/"
          />
        </div>
      </header>

      {/* Filters */}
      <section className="bg-white rounded-xl shadow p-4 md:p-6">
        <h3 className="text-lg font-semibold mb-3">Filtros (Mes/Unidad)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm block mb-1">Fecha inicial (YYYY-MM-DD)</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm block mb-1">Fecha final (YYYY-MM-DD)</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded px-3 py-2"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={loadByMonthUnit}
              className="px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800"
            >
              Aplicar
            </button>
          </div>
        </div>
      </section>

      {/* Tables */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DataTable title="Total de Requisiciones por Unidad" columns={unitCols} rows={byUnit} />
        <DataTable
          title="Requisiciones por Mes y Unidad"
          columns={monthUnitCols}
          rows={byMonthUnit}
        />
        <div className="xl:col-span-2">
          <DataTable title="Requisiciones por Categoría" columns={categoryCols} rows={byCategory} />
        </div>
      </section>

      <p className="text-xs text-gray-500">
        * Nota: El acceso a estos endpoints está restringido a administradores/superusuarios.
      </p>
    </div>
  );
}
