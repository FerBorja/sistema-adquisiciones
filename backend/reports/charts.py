# backend/reports/charts.py
import io
import matplotlib
matplotlib.use("Agg")  # backend sin ventana
import matplotlib.pyplot as plt
from collections import defaultdict
from datetime import datetime

def _fig_to_png_bytesio(fig, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf

def chart_bar_by_department(rows):
    """
    rows: iterable de dicts con:
      {'requesting_department': 'Nombre', 'total': int}
    """
    labels = [r.get('requesting_department') or '—' for r in rows]
    values = [int(r.get('total') or 0) for r in rows]

    fig, ax = plt.subplots(figsize=(9, 4.5))
    ax.bar(labels, values)
    ax.set_title("Requisiciones por Departamento")
    ax.set_xlabel("Departamento")
    ax.set_ylabel("Total")
    ax.tick_params(axis='x', rotation=20)
    ax.grid(True, axis='y', linestyle='--', alpha=0.4)

    return _fig_to_png_bytesio(fig)

def chart_line_month_by_department(rows):
    """
    rows: iterable de dicts con:
      {'month': 'YYYY-MM', 'requesting_department': 'Nombre', 'total': int}
    Dibuja una serie por departamento a través de los meses.
    """
    # Normalizar → dict[dept][month] = total
    depts = set()
    months = set()
    data = defaultdict(lambda: defaultdict(int))
    for r in rows:
        m = (r.get('month') or '').strip()
        d = r.get('requesting_department') or '—'
        t = int(r.get('total') or 0)
        if not m:
            continue
        data[d][m] += t
        depts.add(d)
        months.add(m)

    # Orden cronológico de YYYY-MM
    def to_dt(s):
        try:
            return datetime.strptime(s, "%Y-%m")
        except Exception:
            return datetime(1970, 1, 1)
    months_sorted = sorted(list(months), key=to_dt)

    fig, ax = plt.subplots(figsize=(9, 4.5))
    for dept in sorted(depts):
        y = [data[dept].get(m, 0) for m in months_sorted]
        ax.plot(months_sorted, y, label=dept, linewidth=2)

    ax.set_title("Serie mensual por Departamento")
    ax.set_xlabel("Mes")
    ax.set_ylabel("Total")
    ax.grid(True, linestyle='--', alpha=0.4)
    ax.legend(fontsize=8, ncol=2, loc='upper left')
    ax.set_xticks(months_sorted)
    ax.set_xticklabels(months_sorted, rotation=20, fontsize=8)

    return _fig_to_png_bytesio(fig)