# backend/reports/pdf_generator.py

import os
import io
from collections import Counter, defaultdict
from datetime import datetime

from django.conf import settings

from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether, Image, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# Importa las gráficas que ya creamos
from .charts import chart_bar_by_department, chart_pie_by_category

# --- Mini helper local para pastel de ESTATUS (para no tocar charts.py si no quieres) ---
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def _fig_to_png_bytesio(fig, dpi=150):
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf


def chart_pie_by_status(status_rows):
    """
    status_rows: lista de dicts [{'name': 'pending', 'value': 10}, ...]
    """
    labels = [r['name'] for r in status_rows]
    values = [int(r['value'] or 0) for r in status_rows]
    if sum(values) == 0:
        labels = ['Sin datos']
        values = [1]
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.pie(values, labels=labels, autopct='%1.1f%%')
    ax.set_title("Distribución por Estatus")
    return _fig_to_png_bytesio(fig)


# ---------- helpers no visuales ----------
_PLACEHOLDER_SUBSTRINGS = {
    '<incorrect', 'object at 0x', 'none', 'null'
}

def _is_placeholder(s: str) -> bool:
    if not s:
        return True
    t = str(s).strip().lower()
    if t in {'', '-', '—', 'n/a'}:
        return True
    for frag in _PLACEHOLDER_SUBSTRINGS:
        if frag in t:
            return True
    return False

def _get(obj, name):
    try:
        return getattr(obj, name)
    except Exception:
        return None

def _val(obj, *names, allow_call=False):
    if obj is None:
        return None
    for n in names:
        try:
            v = getattr(obj, n)
        except Exception:
            v = None
        if callable(v) and allow_call:
            try:
                v = v()
            except Exception:
                v = None
        if v is not None and str(v).strip() != '':
            return v
    return None

def _as_text(obj, candidates=None):
    if obj is None:
        return ''
    if candidates:
        v = _val(obj, *candidates, allow_call=True)
        if v is not None and not _is_placeholder(str(v)):
            return str(v)
    try:
        s = str(obj)
        return '' if _is_placeholder(s) else s
    except Exception:
        return ''

def _join_clean(*parts, sep=' - '):
    xs = [p for p in (p.strip() for p in parts if p is not None) if p and not _is_placeholder(p)]
    return sep.join(xs) if xs else ''

def _format_dmy(dt):
    try:
        return dt.strftime('%d/%m/%Y')
    except Exception:
        return ''

def _escape(text: str) -> str:
    if text is None:
        return ''
    s = str(text)
    return (
        s.replace('&', '&amp;')
         .replace('<', '&lt;')
         .replace('>', '&gt;')
    )

def _status_text(req):
    try:
        s = req.get_status_display()
        if s:
            return str(s)
    except Exception:
        pass
    return _as_text(_get(req, 'status')) or '—'

def _label_expense_object(product):
    if product is None:
        return '—'
    code = _as_text(product, ['code', 'clave', 'codigo', 'sku'])
    name = _as_text(product, ['name', 'nombre', 'description', 'descripcion', 'label'])
    lab = _join_clean(code or '', name or '')
    if lab and not _is_placeholder(lab):
        return lab
    lab = _as_text(product)
    return lab or '—'

def _label_unit(unit):
    if unit is None:
        return '—'
    text = (
        _as_text(unit, ['name', 'nombre', 'label', 'descripcion', 'description']) or
        _as_text(unit, ['short_name', 'shortname', 'abbr', 'abbreviation', 'abreviatura', 'symbol', 'simbolo', 'clave', 'codigo', 'code']) or
        _as_text(unit)
    )
    return text or '—'

def _label_description(desc):
    if desc is None:
        return '—'
    text = _as_text(desc, ['text', 'descripcion', 'name', 'label']) or _as_text(desc)
    return text or '—'


# ---------- NUEVO: dashboard KPIs + gráficas en portada ----------
def _compute_kpis(requisitions):
    """
    Calcula KPIs y datasets para gráficas a partir del iterable de Requisition.
    """
    total = 0
    status_counter = Counter()
    dept_counter = Counter()

    for r in requisitions:
        total += 1
        status_counter[str(getattr(r, 'status', '') or '').strip().lower() or '—'] += 1
        dep = _get(r, 'requesting_department')
        dep_name = _as_text(dep, ['name', 'descripcion', 'description', 'label']) or '—'
        dept_counter[dep_name] += 1

    status_rows = [{'name': k, 'value': v} for k, v in status_counter.items()]
    top5 = dept_counter.most_common(5)
    dept_rows = [{'requesting_department': name, 'total': count} for name, count in top5]

    return {
        'total': total,
        'status_rows': status_rows,
        'dept_rows_top5': dept_rows,
    }

def _build_dashboard_story(kpis, logo_path):
    """
    Construye la portada con KPIs y las dos gráficas (estatus y top departamentos).
    Devuelve una lista de flowables para Platypus.
    """
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=16, spaceAfter=6)
    h2 = ParagraphStyle('H2', parent=styles['Heading2'], fontName='Helvetica-Bold', fontSize=13, spaceAfter=4)
    normal = ParagraphStyle('normal', parent=styles['Normal'], fontName='Helvetica', fontSize=10, leading=12)

    story = []

    story.append(Paragraph("Reporte Detallado de Requisiciones", h1))
    story.append(Paragraph("Facultad de Ingeniería — Universidad Autónoma de Chihuahua", normal))
    story.append(Spacer(1, 8))

    total = kpis['total']
    st = {r['name']: r['value'] for r in kpis['status_rows']}
    def getv(key): return st.get(key, 0)

    story.append(Paragraph("Estatus general de requisiciones", h2))
    story.append(Spacer(1, 4))

    kpi_data = [
        ["Total", str(total), "Pending", str(getv('pending')), "Approved", str(getv('approved'))],
        ["Registered", str(getv('registered')), "Completed", str(getv('completed')), "Sent", str(getv('sent'))],
        ["Received", str(getv('received')), "", "", "", ""],
    ]
    kpi_table = Table(kpi_data, colWidths=[80, 60, 80, 60, 80, 60])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ('SPAN', (4, 2), (5, 2)),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 10))

    pie_png = chart_pie_by_status(kpis['status_rows'])
    bar_dept_png = chart_bar_by_department(kpis['dept_rows_top5'])

    story.append(PageBreak())

    story.append(Paragraph("Distribución por Estatus", h2))
    story.append(Image(pie_png, width=260, height=260))
    story.append(Spacer(1, 8))

    story.append(PageBreak())

    story.append(Paragraph("Top 5 Departamentos por Volumen", h2))
    story.append(Image(bar_dept_png, width=520, height=240))
    story.append(Spacer(1, 12))

    story.append(PageBreak())
    return story


# ---------- generator (tabla detallada, ahora con header/footer en todas las páginas) ----------
def generate_requisition_report_pdf(requisitions):
    """
    Genera un PDF DETALLADO con:
      1) Portada tipo dashboard (KPIs + gráficas)
      2) Tabla detallada de requisiciones agrupada por Departamento
      3) Encabezado y pie de página repetidos en TODAS las páginas
    """

    buffer = io.BytesIO()

    # Página y márgenes (landscape)
    PAGE = landscape(letter)
    page_w, page_h = PAGE
    left_margin = 40
    right_margin = 40
    top_margin = 100   # deja espacio para el encabezado
    bottom_margin = 90 # deja espacio para el pie

    # Styles
    styles = getSampleStyleSheet()
    base = styles['Normal']
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=14, spaceAfter=6)
    small = ParagraphStyle('small', parent=base, fontName='Helvetica', fontSize=9, leading=11)
    normal = ParagraphStyle('normal', parent=base, fontName='Helvetica', fontSize=10, leading=12)
    bold = ParagraphStyle('bold', parent=normal, fontName='Helvetica-Bold')
    cell_left = ParagraphStyle('CellLeft', parent=small, wordWrap='CJK', alignment=TA_LEFT)
    cell_center = ParagraphStyle('CellCenter', parent=small, wordWrap='CJK', alignment=TA_CENTER)
    style_title = ParagraphStyle('title', parent=styles['Heading2'], alignment=TA_LEFT, fontSize=13, spaceAfter=10)

    logo_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'uach_logo.png')

    # --- Header/Footer para TODAS las páginas ---
    def draw_page(c, doc):
        # Encabezado
        c.setFont("Helvetica-Bold", 14)
        c.drawString(left_margin, page_h - 50, "Sistema Integral de Adquisiciones FING")
        c.setFont("Helvetica", 12)
        c.drawString(left_margin, page_h - 70, "Universidad Autónoma de Chihuahua — Reportes")
        # Logo
        try:
            if os.path.exists(logo_path):
                c.drawImage(
                    logo_path,
                    x=page_w - right_margin - 120,
                    y=page_h - 85,
                    width=110,
                    height=45,
                    preserveAspectRatio=True,
                    mask='auto'
                )
        except Exception:
            pass
        # Línea separadora
        c.line(left_margin, page_h - 90, page_w - right_margin, page_h - 90)

        # Pie de página: dirección + fecha + número de página
        address_lines = [
            "FACULTAD DE INGENIERÍA",
            "Circuito No. 1, Campus Universitario 2",
            "Chihuahua, Chih. México. C.P. 31125",
            "Tel. (614) 442-95-00",
            "www.uach.mx/fing",
        ]
        c.setFont("Helvetica", 9)
        for i, line in enumerate(address_lines):
            c.drawString(left_margin, 105 - i * 12, line)

        c.setFont("Helvetica-Oblique", 8)
        print_date = datetime.now().strftime("%d/%m/%Y %H:%M")
        c.drawString(left_margin, 40, f"Generado automáticamente — Fecha de impresión: {print_date}")
        c.drawRightString(page_w - right_margin, 40, f"Página {c.getPageNumber()}")

    # Documento
    doc = SimpleDocTemplate(
        buffer,
        pagesize=PAGE,
        leftMargin=left_margin, rightMargin=right_margin,
        topMargin=top_margin, bottomMargin=bottom_margin,
        title="reporte_requisiciones_detallado.pdf"
    )

    # ---- 1) Portada tipo dashboard ----
    kpis = _compute_kpis(requisitions)
    story = _build_dashboard_story(kpis, logo_path)

    # ---- 2) Detalle agrupado por Departamento ----
    reqs_by_dept = defaultdict(list)
    for req in requisitions:
        dname = _as_text(_get(req, 'requesting_department'), ['name', 'descripcion', 'description', 'label']) or 'Sin Departamento'
        reqs_by_dept[dname].append(req)

    def _make_dept_table(data, available_width):
        """
        Ajusta las columnas proporcionalmente al ancho disponible.
        Reparte más ancho a columnas largas (Departamento, Proyecto, Motivo).
        """
        # pesos relativos por columna: ID, Fecha, Usuario, Departamento, Proyecto, Motivo, Estado
        weights = [6, 9, 14, 16, 16, 29, 10]
        total = sum(weights)
        col_widths = [available_width * w / total for w in weights]

        table = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT')
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.gray),
            ('TEXTCOLOR',  (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE',   (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 8),

            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('VALIGN',   (0, 1), (-1, -1), 'TOP'),

            ('LEFTPADDING',  (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING',   (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING',(0, 0), (-1, -1), 3),

            ('GRID', (0, 0), (-1, -1), 0.4, colors.black),
        ]))
        table.splitByRow = True
        return table

    for dept_name in sorted(reqs_by_dept.keys()):
        story.append(Paragraph(f"Departamento: {dept_name}", style_title))
        data = [["ID", "Fecha", "Usuario", "Departamento", "Proyecto", "Motivo", "Estado"]]

        for req in reqs_by_dept[dept_name]:
            created_str = _format_dmy(_get(req, 'created_at'))
            user = _get(req, 'user')
            user_name = (
                _as_text(user, ['full_name', 'get_full_name']) or
                _join_clean(_as_text(user, ['first_name']), _as_text(user, ['last_name'])) or
                _as_text(user)
            )
            dept_label = _as_text(_get(req, 'requesting_department'),
                                  ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
            project = _as_text(_get(req, 'project'),
                               ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
            reason = _as_text(_get(req, 'requisition_reason'),
                              ['text', 'descripcion', 'description', 'label']) or _as_text(_get(req, 'requisition_reason'))
            status_disp = _status_text(req)

            data.append([
                str(req.id),
                created_str or '—',
                Paragraph(_escape(user_name or '—'), cell_left),
                Paragraph(_escape(dept_label or '—'), cell_left),
                Paragraph(_escape(project or '—'), cell_left),
                Paragraph(_escape(reason or '—'), cell_left),
                Paragraph(_escape(status_disp or '—'), cell_center),
            ])

        available_width = doc.width
        table = _make_dept_table(data, available_width)
        story.append(table)
        story.append(Spacer(1, 16))

    # Build con header/footer en todas las páginas
    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)

    buffer.seek(0)
    return buffer
