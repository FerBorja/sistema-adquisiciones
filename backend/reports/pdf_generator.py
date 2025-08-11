# reports/pdf_generator.py

import os
from reportlab.lib.pagesizes import letter, landscape
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle, Paragraph
from reportlab.lib import colors
from io import BytesIO
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from django.conf import settings  # Para obtener ruta base del proyecto

def generate_requisition_report_pdf(requisitions):
    buffer = BytesIO()
    p = canvas.Canvas(buffer, pagesize=landscape(letter))
    width, height = landscape(letter)

    # Ruta absoluta del logo
    logo_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'uach_logo.png')

    # Función para dibujar encabezado con título y logo (para reutilizar en cada página)
    def draw_header():
        p.setFont("Helvetica-Bold", 16)
        p.drawString(40, height - 50, "Reporte de Requisiciones por Unidad Administrativa")

        # Dibujar logo en la esquina superior derecha (ajusta tamaño y margen)
        logo_width = 120
        logo_height = 40
        p.drawImage(logo_path, width - logo_width - 40, height - logo_height - 40, 
                    width=logo_width, height=logo_height, preserveAspectRatio=True, mask='auto')

    # Estilos para Paragraph
    styles = getSampleStyleSheet()
    style_wrap = ParagraphStyle(
        'wrap',
        parent=styles['Normal'],
        alignment=TA_LEFT,
        fontSize=10,
        leading=12,
        spaceAfter=6,
    )
    style_title = ParagraphStyle(
        'title',
        parent=styles['Heading2'],
        alignment=TA_LEFT,
        fontSize=14,
        spaceAfter=12,
    )

    # Primer encabezado en la primera página
    draw_header()
    y = height - 80  # Posición vertical inicial

    # Agrupar requisiciones por unidad administrativa
    requisitions_by_unit = {}
    for req in requisitions:
        unit = req.administrative_unit or "Sin Unidad"
        requisitions_by_unit.setdefault(unit, []).append(req)

    for unit, reqs in requisitions_by_unit.items():
        if y < 150:
            p.showPage()
            draw_header()
            y = height - 50 - 40  # espacio después del header

        # Título de la unidad administrativa
        unit_title = Paragraph(f"Unidad Administrativa: {unit}", style_title)
        w, h = unit_title.wrap(width - 80, y)
        unit_title.drawOn(p, 40, y - h)
        y -= h + 10

        # Crear tabla de requisiciones para esta unidad
        data = [["ID", "Fecha", "Usuario", "Departamento", "Proyecto", "Motivo", "Estado"]]

        for req in reqs:
            created_str = req.created_at.strftime("%Y-%m-%d")
            data.append([
                str(req.id),
                created_str,
                Paragraph(req.user.full_name, style_wrap),
                Paragraph(req.requesting_department.name, style_wrap),
                Paragraph(req.project.description, style_wrap),
                Paragraph(req.requisition_reason, style_wrap),
                Paragraph(req.get_status_display(), style_wrap),
            ])

        table = Table(data, colWidths=[40, 70, 100, 100, 100, 140, 60])
        style = TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.gray),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),

            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),

            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),

            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),

            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ])
        table.setStyle(style)

        w, h = table.wrapOn(p, width - 80, y)
        if y - h < 50:
            p.showPage()
            draw_header()
            y = height - 50 - 40

            unit_title.wrapOn(p, width - 80, y)
            unit_title.drawOn(p, 40, y - h)
            y -= h + 10

            w, h = table.wrapOn(p, width - 80, y)

        table.drawOn(p, 40, y - h)
        y -= h + 30

    p.showPage()
    p.save()
    buffer.seek(0)
    return buffer
