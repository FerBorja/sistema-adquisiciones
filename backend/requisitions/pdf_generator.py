# sistema-adquisiciones/backend/requisitions/pdf_generator.py
import os
from io import BytesIO
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# ---------- helpers ----------
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
    # Minimal XML escaping for Paragraph
    if text is None:
        return ''
    s = str(text)
    return (
        s.replace('&', '&amp;')
         .replace('<', '&lt;')
         .replace('>', '&gt;')
    )

def _dedup_join(code, name, sep=' - '):
    """Join code+name but avoid duplicates like '123 - Papelería - Papelería'
    or when one already contains the other (case-insensitive, punctuation-insensitive)."""
    c = (code or '').strip()
    n = (name or '').strip()
    if not c and not n:
        return ''
    if not c:
        return n
    if not n:
        return c

    def simplify(x: str) -> str:
        x = x.lower().strip()
        return ''.join(ch for ch in x if ch.isalnum() or ch.isspace())

    sc, sn = simplify(c), simplify(n)
    if not sc and not sn:
        return ''

    if sn and sn in sc:
        return c
    if sc and sc in sn:
        return n
    if sc == sn:
        return c
    return f"{c}{sep}{n}"

# ---------- money helpers ----------
def _d(v):
    if v is None:
        return None
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return None

def money_mxn(v):
    dv = _d(v)
    if dv is None:
        return ""
    dv = dv.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return f"${dv:,.2f}"

# Build best label for product / expense object with de-dup
def _label_expense_object(product):
    if product is None:
        return '—'

    # Prefer nested expense_object if present
    eo = _get(product, 'expense_object') or _get(product, 'objeto_gasto') or _get(product, 'object_of_expense')
    if eo:
        code = _as_text(eo, ['code', 'clave', 'codigo', 'key', 'partida', 'partida_generica', 'partida_especifica'])
        name = _as_text(eo, ['name', 'nombre', 'description', 'descripcion', 'label'])
        lab = _dedup_join(code, name)
        if lab and not _is_placeholder(lab):
            return lab
        lab = _as_text(eo)
        if lab and not _is_placeholder(lab):
            return lab

    # Fallback to product itself
    code = _as_text(product, ['code', 'clave', 'codigo', 'sku'])
    name = _as_text(product, ['name', 'nombre', 'description', 'descripcion', 'label'])
    lab = _dedup_join(code, name)
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

# ---------- generator (now using Platypus so the items table can split across pages) ----------
def generate_requisition_pdf(requisition):
    buffer = BytesIO()

    # Page geometry
    PAGE = letter
    page_w, page_h = PAGE
    left_margin = 50
    right_margin = 50
    top_margin = 120    # leave space for header (title + logo + line)
    bottom_margin = 100
    line_height = 16

    # Styles
    styles = getSampleStyleSheet()
    base = styles['Normal']
    h1 = ParagraphStyle('H1', parent=styles['Heading1'], fontName='Helvetica-Bold', fontSize=14, spaceAfter=6)
    small = ParagraphStyle('small', parent=base, fontName='Helvetica', fontSize=9, leading=11)
    normal = ParagraphStyle('normal', parent=base, fontName='Helvetica', fontSize=10, leading=12)
    bold = ParagraphStyle('bold', parent=normal, fontName='Helvetica-Bold')
    cell_left = ParagraphStyle('CellLeft', parent=small, wordWrap='CJK', alignment=TA_LEFT)
    cell_center = ParagraphStyle('CellCenter', parent=small, wordWrap='CJK', alignment=TA_CENTER)
    cell_right = ParagraphStyle('CellRight', parent=small, wordWrap='CJK', alignment=TA_RIGHT)
    sig_title = ParagraphStyle('SigTitle', parent=base, fontName='Helvetica-Bold', fontSize=10, alignment=TA_CENTER)
    sig_name = ParagraphStyle('SigName', parent=base, fontName='Helvetica', fontSize=9, alignment=TA_CENTER)

    # Header/footer drawing (repeats on all pages)
    logo_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'uach_logo.png')

    admin_unit = _as_text(_get(requisition, 'administrative_unit'),
                          ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    user = _get(requisition, 'user')
    user_name = (
        _as_text(user, ['full_name', 'get_full_name']) or
        _join_clean(_as_text(user, ['first_name']), _as_text(user, ['last_name'])) or
        _as_text(user)
    )

    def draw_page(c, doc):
        # Header title
        c.setFont("Helvetica-Bold", 14)
        c.drawString(left_margin, page_h - 50, "Sistema Integral de Adquisiciones FING")
        c.setFont("Helvetica", 12)
        c.drawString(left_margin, page_h - 70, "Universidad Autónoma de Chihuahua - Requisición")
        # Logo
        try:
            if os.path.exists(logo_path):
                c.drawImage(logo_path, x=page_w - right_margin - 100, y=page_h - 80,
                            width=100, height=50, preserveAspectRatio=True, mask='auto')
        except Exception:
            pass
        # Separator line
        c.line(left_margin, page_h - 90, page_w - right_margin, page_h - 90)

        # Footer (address + printed at + generated by)
        address_lines = [
            "FACULTAD DE INGENIERÍA",
            "Circuito No. 1, Campus Universitario 2",
            "Chihuahua, Chih. México. C.P. 31125",
            "Tel. (614) 442-95-00",
            "www.uach.mx/fing"
        ]
        c.setFont("Helvetica", 9)
        for i, line in enumerate(address_lines):
            c.drawString(left_margin, 110 - i * 12, line)

        footer_left = f"Generado por {user_name or '—'} - {(admin_unit or '—')}"
        print_date = datetime.now().strftime("%d/%m/%Y %H:%M")
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(left_margin, 40, footer_left)
        c.drawRightString(page_w - right_margin, 40, f"Fecha de impresión: {print_date}")

    # Document
    doc = SimpleDocTemplate(
        buffer,
        pagesize=PAGE,
        leftMargin=left_margin, rightMargin=right_margin,
        topMargin=top_margin, bottomMargin=bottom_margin,
        title=f"requisicion_{requisition.id}.pdf"
    )

    story = []

    # Folio
    story.append(Paragraph(f"Folio {requisition.id}", bold))
    story.append(Spacer(1, 8))

    # Top fields as a two-column table (label/value) that wraps
    created_at = _format_dmy(_get(requisition, 'created_at'))
    requesting_department = _as_text(_get(requisition, 'requesting_department'),
                                     ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    project = _as_text(_get(requisition, 'project'),
                       ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    funding_source = _as_text(_get(requisition, 'funding_source'),
                              ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    budget_unit = _as_text(_get(requisition, 'budget_unit'),
                           ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    agreement = _as_text(_get(requisition, 'agreement'),
                         ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    tender = _as_text(_get(requisition, 'tender'),
                      ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    external_service = _as_text(_get(requisition, 'external_service'),
                                ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    requisition_reason = _as_text(_get(requisition, 'requisition_reason'),
                                  ['text', 'descripcion', 'description', 'label']) or _as_text(_get(requisition, 'requisition_reason'))

    fields = [
        ("Unidad Administrativa", admin_unit or '—'),
        ("Departamento Solicitante", requesting_department or '—'),
        ("Proyecto", project or '—'),
        ("Fuente de Financiamiento", funding_source or '—'),
        ("Unidad Presupuestal", budget_unit or '—'),
        ("Convenios", agreement or '—'),
        ("Fecha de Creación", created_at or '—'),
        ("Motivos de Requisición", requisition_reason or '—'),
        ("Servicio Externo / Académico", external_service or '—'),
        ("Licitación", tender or '—'),
        ("Solicitante", user_name or '—'),
    ]
    field_rows = [[Paragraph(f"<b>{_escape(lbl)}:</b>", normal),
                   Paragraph(_escape(val), normal)] for lbl, val in fields]

    fields_table = Table(field_rows, colWidths=[180, doc.width - 180])
    fields_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))
    story.append(fields_table)
    story.append(Spacer(1, 12))

    # ---- Items table (SPLITS ACROSS PAGES) ----
    items_data = [[
        Paragraph("Objeto del Gasto", ParagraphStyle('th', parent=bold, alignment=TA_LEFT)),
        Paragraph("Cantidad", ParagraphStyle('th2', parent=bold, alignment=TA_CENTER)),
        Paragraph("Unidad", ParagraphStyle('th3', parent=bold, alignment=TA_CENTER)),
        Paragraph("Descripción", ParagraphStyle('th4', parent=bold, alignment=TA_LEFT)),
        Paragraph("Costo unitario (MXN)", ParagraphStyle('th5', parent=bold, alignment=TA_RIGHT)),
        Paragraph("Total (MXN)", ParagraphStyle('th6', parent=bold, alignment=TA_RIGHT)),
    ]]

    grand_total = Decimal("0.00")

    try:
        for item in requisition.items.all():
            prod_label = _label_expense_object(_get(item, 'product')) or '—'
            unit_label = _label_unit(_get(item, 'unit')) or '—'

            manual = _as_text(_get(item, "manual_description"))
            desc_label = manual or (_label_description(_get(item, 'description')) or '—')

            # quantity as Decimal (for calculations)
            qty_raw = _get(item, 'quantity')
            qty_dec = _d(qty_raw) or Decimal("0")

            # pretty quantity string
            try:
                if qty_raw is None:
                    qty_str = '—'
                elif float(qty_raw).is_integer():
                    qty_str = str(int(float(qty_raw)))
                else:
                    qty_str = str(qty_raw)
            except Exception:
                qty_str = _as_text(qty_raw) or '—'

            est_unit = _d(_get(item, 'estimated_unit_cost'))
            est_total = _d(_get(item, 'estimated_total'))

            # Si no hay total pero sí hay unitario -> calcular total
            if (est_total is None or est_total <= 0) and qty_dec > 0 and est_unit is not None and est_unit > 0:
                est_total = (qty_dec * est_unit).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            # Si no hay unitario, pero sí hay total -> calcular unitario
            if (est_unit is None or est_unit <= 0) and qty_dec > 0 and est_total is not None and est_total > 0:
                est_unit = (est_total / qty_dec).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

            # defaults for display/sum
            est_total_sum = est_total if est_total is not None else Decimal("0.00")
            grand_total += est_total_sum

            items_data.append([
                Paragraph(_escape(prod_label), cell_left),
                Paragraph(_escape(qty_str), cell_center),
                Paragraph(_escape(unit_label), cell_center),
                Paragraph(_escape(desc_label), cell_left),
                Paragraph(_escape(money_mxn(est_unit)), cell_right),
                Paragraph(_escape(money_mxn(est_total)), cell_right),
            ])
    except Exception:
        items_data.append(['—', '—', '—', '—', '—', '—'])

    # Fila TOTAL
    items_data.append([
        Paragraph("", cell_left),
        Paragraph("", cell_center),
        Paragraph("", cell_center),
        Paragraph("TOTAL", ParagraphStyle('total_lbl', parent=bold, alignment=TA_RIGHT)),
        Paragraph("", cell_right),
        Paragraph(_escape(money_mxn(grand_total)), ParagraphStyle('total_val', parent=bold, alignment=TA_RIGHT)),
    ])

    # Column widths (must add up to doc.width)
    col0 = 140  # Objeto del gasto
    col1 = 45   # Cantidad
    col2 = 55   # Unidad
    col4 = 60   # Unitario
    col5 = 60   # Total
    col3 = max(120, doc.width - (col0 + col1 + col2 + col4 + col5))  # Descripción (flex)

    items_table = Table(
        items_data,
        colWidths=[col0, col1, col2, col3, col4, col5],
        repeatRows=1
    )
    items_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),

        ('VALIGN', (0, 1), (-1, -1), 'TOP'),

        ('ALIGN', (1, 1), (2, -2), 'CENTER'),   # Cantidad + Unidad (body rows)
        ('ALIGN', (4, 1), (5, -1), 'RIGHT'),    # montos
        ('ALIGN', (0, 1), (0, -1), 'LEFT'),
        ('ALIGN', (3, 1), (3, -1), 'LEFT'),

        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),

        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), colors.whitesmoke),
    ]))

    story.append(items_table)
    story.append(Spacer(1, 8))

    story.append(Paragraph(f"<b>Total requisición:</b> {money_mxn(grand_total)}", normal))
    story.append(Spacer(1, 12))

    # ---- Observaciones ----
    obs_text = _as_text(_get(requisition, 'observations'),
                        ['text', 'descripcion', 'description', 'label'])
    if obs_text:
        obs_title = Paragraph("<b>Observaciones:</b>", normal)
        obs_par = Paragraph(_escape(obs_text), normal)
        try:
            story.append(KeepTogether([obs_title, Spacer(1, 4), obs_par, Spacer(1, 12)]))
        except Exception:
            story.extend([obs_title, Spacer(1, 4), obs_par, Spacer(1, 12)])

    # ---- Signatures table (3 columns) ----
    requester_name = user_name or '—'
    titles_row = [
        Paragraph("Solicitó", sig_title),
        Paragraph("Revisó", sig_title),
        Paragraph("Autorizó", sig_title),
    ]
    names_row = [
        Paragraph(_escape(requester_name), sig_name),
        Paragraph("M.I. Arión Ehécatl Juárez Menchaca", sig_name),
        Paragraph("M.I. Adrián Isaac Orpinel Ureña", sig_name),
    ]
    sign_table = Table(
        [titles_row, ["", "", ""], names_row],
        colWidths=[doc.width / 3.0] * 3,
        rowHeights=[None, 40, None]
    )
    sign_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 1), (-1, 1), 1, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))

    try:
        story.append(KeepTogether([Spacer(1, 8), sign_table]))
    except Exception:
        story.extend([Spacer(1, 8), sign_table])

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)

    buffer.seek(0)
    return buffer