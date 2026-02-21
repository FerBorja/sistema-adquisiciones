// frontend/src/pages/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import apiClient from "../api/apiClient";

// Recharts
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

function Section({ title, children, right }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border p-4 md:p-6 mb-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="text-lg md:text-xl font-semibold text-gray-800">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

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
      disabled={downloading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
    >
      {downloading ? "Generando…" : title}
    </button>
  );
}

export default function Reports() {
  // raw data states
  const [byUnit, setByUnit] = useState([]); // [{ requesting_department, total }]
  const [byMonthUnit, setByMonthUnit] = useState([]); // [{ month:'YYYY-MM', requesting_department, total }]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // filters
  const todayISO = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState("" /* e.g. "2025-01-01" */);
  const [endDate, setEndDate] = useState("");

  // palette for dynamic series
  const PALETTE = [
    "#4f46e5", // indigo-600
    "#10b981", // emerald-500
    "#f59e0b", // amber-500
    "#ef4444", // red-500
    "#06b6d4", // cyan-500
    "#8b5cf6", // violet-500
    "#22c55e", // green-500
    "#e11d48", // rose-600
    "#0ea5e9", // sky-500
    "#a855f7", // purple-500
  ];

  // Fetch simple endpoints (no filters)
  const fetchStatic = async () => {
    const [u] = await Promise.all([
      apiClient.get("/reports/by-unit/"),
    ]);
    setByUnit(u.data || []);
  };

  // Fetch month+unit (with optional filters)
  const fetchByMonthUnit = async () => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const qs = params.toString();
    const url = qs ? `/reports/by-month-unit/?${qs}` : "/reports/by-month-unit/";
    const r = await apiClient.get(url);
    setByMonthUnit(r.data || []);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([fetchStatic(), fetchByMonthUnit()]);
    } catch (e) {
      console.error(e);
      setError("No se pudieron cargar los datos de reportes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // re-fetch when filters change (only the month+unit chart depends on dates)
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await fetchByMonthUnit();
      } catch (e) {
        console.error(e);
        setError("No se pudieron cargar los datos por mes.");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  // ---- DERIVED DATA FOR CHARTS ----

  // 1) Bar: totals by department
  const dataByUnit = useMemo(() => {
    return (byUnit || []).map((row) => ({
      unit: row.requesting_department || "—",
      total: Number(row.total) || 0,
    }));
  }, [byUnit]);

  // 2) Line (multi-series): each department as a line across months
  const lineData = useMemo(() => {
    const months = Array.from(new Set((byMonthUnit || []).map((r) => r.month))).sort();
    const units = Array.from(
      new Set((byMonthUnit || []).map((r) => r.requesting_department || "—"))
    );

    const map = new Map();
    for (const m of months) map.set(m, { month: m });

    for (const r of byMonthUnit || []) {
      const m = r.month;
      const u = r.requesting_department || "—";
      const o = map.get(m) || { month: m };
      o[u] = (o[u] || 0) + Number(r.total || 0);
      map.set(m, o);
    }

    return { rows: Array.from(map.values()), units };
  }, [byMonthUnit]);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Reportes y Estadísticas</h1>
          <p className="text-gray-600 mt-1">Panel de análisis (solo administradores)</p>
        </header>

        {/* Filters */}
        <Section
          title="Filtros de periodo (para series por mes)"
          right={
            <div className="flex items-center gap-2">
              <DownloadButton title="PDF Resumen" endpoint="/reports/summary-pdf/" />
              <DownloadButton title="PDF Detallado" endpoint="/reports/requisitions-report/" />
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Fecha inicio</span>
              <input
                type="date"
                value={startDate}
                max={endDate || todayISO}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-gray-600">Fecha fin</span>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                max={todayISO}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border-gray-300 focus:ring-2 focus:ring-indigo-500"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="h-[42px] inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 rounded-lg border bg-white hover:bg-gray-50"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        </Section>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Totals by Department (Bar) */}
        <Section title="Requisiciones por Departamento">
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <BarChart data={dataByUnit} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="unit" tick={{ fontSize: 12 }} angle={-10} textAnchor="end" height={50} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" name="Total" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* By Month + Department (Lines) */}
        <Section title="Serie mensual por Departamento (filtrable por fechas)">
          <div className="h-80 w-full">
            <ResponsiveContainer>
              <LineChart data={lineData.rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                {lineData.units.map((u, idx) => (
                  <Line
                    key={u}
                    type="monotone"
                    dataKey={u}
                    name={u}
                    stroke={PALETTE[idx % PALETTE.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {loading && (
          <div className="text-sm text-gray-500">Cargando datos…</div>
        )}
      </div>
    </div>
  );
}