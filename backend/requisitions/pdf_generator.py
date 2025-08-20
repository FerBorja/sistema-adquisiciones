# sistema-adquisiciones/backend/requisitions/pdf_generator.py
import os
from io import BytesIO
from datetime import datetime
from django.conf import settings
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER

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
        # drop punctuation, keep letters/numbers/spaces
        return ''.join(ch for ch in x if ch.isalnum() or ch.isspace())

    sc, sn = simplify(c), simplify(n)
    if not sc and not sn:
        return ''

    # if one contains the other, return the richer original
    if sn and sn in sc:
        return c
    if sc and sc in sn:
        return n

    # identical after simplification → return one
    if sc == sn:
        return c

    return f"{c}{sep}{n}"

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
        # fallback to eo string
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

# ---------- generator ----------
def generate_requisition_pdf(requisition):
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # Paths
    logo_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'uach_logo.png')

    # Margins
    margin_left = 50
    margin_top = height - 50
    bottom_margin = 80
    line_height = 16

    # Styles for wrapped table cells / paragraphs
    styles = getSampleStyleSheet()
    base = styles['Normal']
    cell_left = ParagraphStyle(
        'CellLeft', parent=base, fontName='Helvetica', fontSize=9, leading=11,
        wordWrap='CJK',  # allows breaking long tokens
        alignment=TA_LEFT, spaceBefore=0, spaceAfter=0
    )
    cell_center = ParagraphStyle(
        'CellCenter', parent=cell_left, alignment=TA_CENTER
    )
    para_left = ParagraphStyle(
        'ParaLeft', parent=base, fontName='Helvetica', fontSize=10, leading=12,
        wordWrap='CJK', alignment=TA_LEFT, spaceBefore=0, spaceAfter=0
    )
    sig_title = ParagraphStyle(
        'SigTitle', parent=base, fontName='Helvetica-Bold', fontSize=10,
        alignment=TA_CENTER, spaceBefore=0, spaceAfter=2
    )
    sig_name = ParagraphStyle(
        'SigName', parent=base, fontName='Helvetica', fontSize=9,
        alignment=TA_CENTER, spaceBefore=2, spaceAfter=0
    )

    # Header
    p.setFont("Helvetica-Bold", 14)
    p.drawString(margin_left, margin_top, "Sistema Integral de Adquisiciones FING")
    p.setFont("Helvetica", 12)
    p.drawString(margin_left, margin_top - 20, "Universidad Autónoma de Chihuahua - Requisición")

    # Logo (optional)
    try:
        if os.path.exists(logo_path):
            p.drawImage(
                logo_path, x=500, y=height - 80,
                width=100, height=50, preserveAspectRatio=True, mask='auto'
            )
    except Exception:
        pass

    # Line
    p.line(margin_left, margin_top - 60, width - margin_left, margin_top - 60)

    y = margin_top - 80

    # Requisition header info
    p.setFont("Helvetica-Bold", 12)
    p.drawString(margin_left, y, f"Folio {requisition.id}")
    y -= line_height * 2

    # User full name
    user = _get(requisition, 'user')
    user_name = (
        _as_text(user, ['full_name', 'get_full_name']) or
        _join_clean(_as_text(user, ['first_name']), _as_text(user, ['last_name'])) or
        _as_text(user)
    )

    # Top fields
    created_at = _format_dmy(_get(requisition, 'created_at'))
    administrative_unit = _as_text(_get(requisition, 'administrative_unit'),
                                   ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
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
    category = _as_text(_get(requisition, 'category'),
                        ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    tender = _as_text(_get(requisition, 'tender'),
                      ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    external_service = _as_text(_get(requisition, 'external_service'),
                                ['code', 'clave', 'codigo', 'name', 'nombre', 'description', 'descripcion', 'label'])
    requisition_reason = _as_text(_get(requisition, 'requisition_reason'),
                                  ['text', 'descripcion', 'description', 'label']) or _as_text(_get(requisition, 'requisition_reason'))

    p.setFont("Helvetica", 10)
    fields = [
        ("Unidad Administrativa", administrative_unit or '—'),
        ("Departamento Solicitante", requesting_department or '—'),
        ("Proyecto", project or '—'),
        ("Fuente de Financiamiento", funding_source or '—'),
        ("Unidad Presupuestal", budget_unit or '—'),
        ("Convenios", agreement or '—'),
        ("Categoría", category or '—'),
        ("Fecha de Creación", created_at or '—'),
        ("Motivos de Requisición", requisition_reason or '—'),
        ("Servicio Externo / Académico", external_service or '—'),
        ("Licitación", tender or '—'),
        ("Solicitante", user_name or '—'),
    ]
    for label, value in fields:
        p.drawString(margin_left, y, f"{label}: {value}")
        y -= line_height

    y -= line_height

    # ---- Table data with wrapped cells ----
    items_data = [['Objeto del Gasto', 'Cantidad', 'Unidad', 'Descripción']]
    try:
        for item in requisition.items.all():
            prod_label = _label_expense_object(_get(item, 'product')) or '—'
            unit_label = _label_unit(_get(item, 'unit')) or '—'
            desc_label = _label_description(_get(item, 'description')) or '—'

            qty = _get(item, 'quantity')
            try:
                if qty is None:
                    qty_str = '—'
                elif float(qty).is_integer():
                    qty_str = str(int(float(qty)))
                else:
                    qty_str = str(qty)
            except Exception:
                qty_str = _as_text(qty) or '—'

            # Wrap text via Paragraphs (escape to avoid XML issues)
            prod_par = Paragraph(_escape(prod_label), style=cell_left)
            unit_par = Paragraph(_escape(unit_label), style=cell_center)
            desc_par = Paragraph(_escape(desc_label), style=cell_left)
            qty_par = Paragraph(_escape(qty_str), style=cell_center)

            items_data.append([prod_par, qty_par, unit_par, desc_par])
    except Exception:
        items_data.append(['—', '—', '—', '—'])

    # Column widths: compute last col to fill page width
    table_max_width = width - 2 * margin_left
    col0, col1, col2 = 150, 60, 80
    col3 = max(140, table_max_width - (col0 + col1 + col2))  # ensure decent width for Descripción

    table = Table(items_data, colWidths=[col0, col1, col2, col3])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('VALIGN', (0, 1), (-1, -1), 'TOP'),  # important for multi-line cells
        ('ALIGN', (1, 1), (2, -1), 'CENTER'), # qty + unit columns center
        ('ALIGN', (0, 1), (0, -1), 'LEFT'),
        ('ALIGN', (3, 1), (3, -1), 'LEFT'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))

    # Draw table (auto row heights thanks to Paragraph)
    table_width, table_height = table.wrap(0, 0)
    table_y = y - table_height
    if table_y < bottom_margin:
        p.showPage()
        y = height - bottom_margin
        table_y = y - table_height
    table.drawOn(p, margin_left, table_y)
    y = table_y - line_height * 2

    # ---- Observaciones (below table) ----
    obs_text = _as_text(_get(requisition, 'observations'),
                        ['text', 'descripcion', 'description', 'label'])
    if obs_text:
        obs_par = Paragraph(_escape(obs_text), style=para_left)
        avail_w = width - 2 * margin_left
        _, obs_h = obs_par.wrap(avail_w, height)

        needed = line_height + obs_h + line_height  # title + paragraph + spacing
        if y - needed < bottom_margin:
            p.showPage()
            y = height - bottom_margin

        p.setFont("Helvetica-Bold", 12)
        p.drawString(margin_left, y, "Observaciones:")
        y -= line_height

        obs_par.drawOn(p, margin_left, y - obs_h)
        y = y - obs_h - line_height

    # ---- Signature table (replace "Firmas:" with a 3-column sign table) ----
    # Titles: Solicitó | Revisó | Autorizó
    # Row 2: space to sign (with lines)
    # Row 3: names (requester + fixed names)
    titles_row = [
        Paragraph("Solicitó", sig_title),
        Paragraph("Revisó", sig_title),
        Paragraph("Autorizó", sig_title),
    ]
    names_row = [
        Paragraph(_escape(user_name or '—'), sig_name),
        Paragraph("M.I. Arión Ehécatl Juárez Menchaca", sig_name),
        Paragraph("M.I. Adrián Isaac Orpinel Ureña", sig_name),
    ]
    sign_data = [
        titles_row,
        ["", "", ""],   # space to sign (we'll draw a line below)
        names_row,
    ]

    avail_w = width - 2 * margin_left
    col_w = avail_w / 3.0
    sign_table = Table(sign_data, colWidths=[col_w, col_w, col_w], rowHeights=[None, 40, None])
    sign_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        # Draw signature lines below the signing row (row index 1)
        ('LINEBELOW', (0, 1), (-1, 1), 1, colors.black),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        # No outer grid for a cleaner look
    ]))

    sw, sh = sign_table.wrap(0, 0)
    if y - sh < bottom_margin:
        p.showPage()
        y = height - bottom_margin
    sign_table.drawOn(p, margin_left, y - sh)
    y = y - sh - line_height

    # Address block
    address_lines = [
        "FACULTAD DE INGENIERÍA",
        "Circuito No. 1, Campus Universitario 2",
        "Chihuahua, Chih. México. C.P. 31125",
        "Tel. (614) 442-95-00",
        "www.uach.mx/fing"
    ]
    p.setFont("Helvetica", 9)
    for i, line in enumerate(address_lines):
        p.drawString(50, 110 - i * 12, line)

    # Footer
    footer_left = f"Generado por {user_name or '—'} - {(administrative_unit or '—')}"
    print_date = datetime.now().strftime("%d/%m/%Y %H:%M")
    p.setFont("Helvetica-Oblique", 8)
    p.drawString(margin_left, 40, footer_left)
    p.drawRightString(width - margin_left, 40, f"Fecha de impresión: {print_date}")

    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer
