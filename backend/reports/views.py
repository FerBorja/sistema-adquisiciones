# backend/reports/views.py

from rest_framework.views import APIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from django.db.models import Count
from django.utils.dateparse import parse_date
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from rest_framework.decorators import action
from rest_framework import viewsets, permissions

from requisitions.models import Requisition
from .pdf_generator import generate_requisition_report_pdf
from .charts import chart_bar_by_department, chart_line_month_by_department

import io


class RequisitionsByUnitView(APIView):
    """
    Totales por Departamento
    GET /api/reports/by-unit/
    Respuesta: [{ "requesting_department": "<nombre>", "total": <int> }, ...]
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        data = (
            Requisition.objects
            .values('requesting_department__name')
            .annotate(total=Count('id'))
            .order_by('requesting_department__name')
        )
        result = [{
            'requesting_department': item['requesting_department__name'] or '—',
            'total': item['total'],
        } for item in data]
        return Response(result)


class RequisitionsByMonthAndUnitView(APIView):
    """
    Serie por mes y Departamento
    GET /api/reports/by-month-unit/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    Respuesta: [{ "month": "YYYY-MM", "requesting_department": "<nombre>", "total": <int> }, ...]
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        queryset = Requisition.objects.all()
        if start_date:
            queryset = queryset.filter(created_at__gte=parse_date(start_date))
        if end_date:
            queryset = queryset.filter(created_at__lte=parse_date(end_date))

        data = (
            queryset
            .annotate(month=TruncMonth('created_at'))
            .values('month', 'requesting_department__name')
            .annotate(total=Count('id'))
            .order_by('month', 'requesting_department__name')
        )

        result = [{
            'month': item['month'].strftime('%Y-%m'),
            'requesting_department': item['requesting_department__name'] or '—',
            'total': item['total'],
        } for item in data]

        return Response(result)


class RequisitionSummaryPDFView(APIView):
    """
    PDF de resumen con GRÁFICAS (una por página):
      Pág. 1: Barras - Requisiciones por Departamento
      Pág. 2: Líneas - Serie mensual por Departamento (respeta start_date / end_date)
    GET /api/reports/summary-pdf/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        import io, os
        from django.conf import settings
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from datetime import datetime

        # --- 1) Datos para las gráficas ---
        by_dept = (
            Requisition.objects
            .values('requesting_department__name')
            .annotate(total=Count('id'))
            .order_by('requesting_department__name')
        )
        bar_rows = [{
            'requesting_department': row['requesting_department__name'] or '—',
            'total': row['total'],
        } for row in by_dept]

        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        queryset = Requisition.objects.all()
        if start_date:
            queryset = queryset.filter(created_at__gte=parse_date(start_date))
        if end_date:
            queryset = queryset.filter(created_at__lte=parse_date(end_date))

        by_month_dept = (
            queryset
            .annotate(month=TruncMonth('created_at'))
            .values('month', 'requesting_department__name')
            .annotate(total=Count('id'))
            .order_by('month', 'requesting_department__name')
        )
        line_rows = [{
            'month': row['month'].strftime('%Y-%m'),
            'requesting_department': row['requesting_department__name'] or '—',
            'total': row['total'],
        } for row in by_month_dept]

        # --- 2) Render de imágenes ---
        bar_png  = chart_bar_by_department(bar_rows)
        line_png = chart_line_month_by_department(line_rows)

        # --- 3) Construcción del PDF con header/footer ---
        buffer = io.BytesIO()

        left_margin, right_margin = 40, 40
        top_margin, bottom_margin = 100, 90
        page_w, page_h = letter
        logo_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'uach_logo.png')

        # Header/Footer
        def draw_page(c, doc):
            # Encabezado
            c.setFont("Helvetica-Bold", 14)
            c.drawString(left_margin, page_h - 50, "Sistema Integral de Adquisiciones FING")
            c.setFont("Helvetica", 12)
            c.drawString(left_margin, page_h - 70, "Universidad Autónoma de Chihuahua — Reportes")
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
            c.line(left_margin, page_h - 90, page_w - right_margin, page_h - 90)

            # Pie
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
            pagesize=letter,
            leftMargin=left_margin, rightMargin=right_margin,
            topMargin=top_margin, bottomMargin=bottom_margin,
            title="Resumen de Requisiciones"
        )

        styles = getSampleStyleSheet()
        h1 = styles['Heading1']
        h2 = styles['Heading2']
        small = ParagraphStyle('small', parent=styles['Normal'], fontSize=9)

        story = []

        # Página 1
        story.append(Paragraph("Resumen de Requisiciones", h1))
        if start_date or end_date:
            story.append(Paragraph(f"Rango: {start_date or '—'} a {end_date or '—'}", small))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Requisiciones por Departamento", h2))
        story.append(Spacer(1, 6))
        story.append(Image(bar_png, width=540, height=300))
        story.append(PageBreak())

        # Página 2
        story.append(Paragraph("Resumen de Requisiciones", h1))
        if start_date or end_date:
            story.append(Paragraph(f"Rango: {start_date or '—'} a {end_date or '—'}", small))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Serie Mensual por Departamento", h2))
        story.append(Spacer(1, 6))
        story.append(Image(line_png, width=540, height=300))

        # Con header/footer en todas las páginas
        doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)

        buffer.seek(0)
        return HttpResponse(buffer, content_type='application/pdf')


class ReportsViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAdminUser]

    @action(detail=False, methods=['get'])
    def requisitions_report(self, request):
        requisitions = Requisition.objects.all().order_by('-created_at')
        pdf_buffer = generate_requisition_report_pdf(requisitions)
        return HttpResponse(pdf_buffer, content_type='application/pdf')