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

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from requisitions.models import Requisition
from .pdf_generator import generate_requisition_report_pdf
from .charts import chart_bar_by_department, chart_line_month_by_department, chart_pie_by_category

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


class RequisitionsByCategoryView(APIView):
    """
    Totales por Categoría
    GET /api/reports/by-category/
    Respuesta: [{ "category__name": "<nombre>", "total": <int> }, ...]
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        data = (
            Requisition.objects
            .values('category__name')
            .annotate(total=Count('id'))
            .order_by('category__name')
        )
        return Response(data)


class RequisitionSummaryPDFView(APIView):
    """
    PDF de resumen con GRÁFICAS (una por página):
      Pág. 1: Barras - Requisiciones por Departamento
      Pág. 2: Líneas - Serie mensual por Departamento (respeta start_date / end_date)
      Pág. 3: Pastel - Distribución por Categoría
    GET /api/reports/summary-pdf/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        import io
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        # --- 1) Datos para las 3 gráficas ---
        # Barras por Departamento
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

        # Serie mensual por Departamento (con filtros)
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

        # Pastel por Categoría
        by_cat = (
            Requisition.objects
            .values('category__name')
            .annotate(total=Count('id'))
            .order_by('category__name')
        )
        pie_rows = list(by_cat)

        # --- 2) Render de imágenes en memoria ---
        bar_png  = chart_bar_by_department(bar_rows)
        line_png = chart_line_month_by_department(line_rows)
        pie_png  = chart_pie_by_category(pie_rows)

        # --- 3) Construcción del PDF (una gráfica por página) ---
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, title="Resumen de Requisiciones")
        styles = getSampleStyleSheet()
        h1 = styles['Heading1']
        h2 = styles['Heading2']
        small = ParagraphStyle('small', parent=styles['Normal'], fontSize=9)

        story = []

        # Página 1: Barras por Departamento
        story.append(Paragraph("Resumen de Requisiciones", h1))
        if start_date or end_date:
            story.append(Paragraph(f"Rango: {start_date or '—'} a {end_date or '—'}", small))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Requisiciones por Departamento", h2))
        story.append(Spacer(1, 6))
        # ancho alto pensados para letter vertical y márgenes por defecto
        story.append(Image(bar_png, width=540, height=300))
        story.append(PageBreak())

        # Página 2: Serie mensual por Departamento
        story.append(Paragraph("Resumen de Requisiciones", h1))
        if start_date or end_date:
            story.append(Paragraph(f"Rango: {start_date or '—'} a {end_date or '—'}", small))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Serie Mensual por Departamento", h2))
        story.append(Spacer(1, 6))
        story.append(Image(line_png, width=540, height=300))
        story.append(PageBreak())

        # Página 3: Pastel por Categoría
        story.append(Paragraph("Resumen de Requisiciones", h1))
        if start_date or end_date:
            story.append(Paragraph(f"Rango: {start_date or '—'} a {end_date or '—'}", small))
        story.append(Spacer(1, 6))
        story.append(Paragraph("Distribución por Categoría", h2))
        story.append(Spacer(1, 6))
        story.append(Image(pie_png, width=420, height=420))

        doc.build(story)
        buffer.seek(0)
        return HttpResponse(buffer, content_type='application/pdf')


class ReportsViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAdminUser]

    @action(detail=False, methods=['get'])
    def requisitions_report(self, request):
        requisitions = Requisition.objects.all().order_by('-created_at')
        pdf_buffer = generate_requisition_report_pdf(requisitions)
        return HttpResponse(pdf_buffer, content_type='application/pdf')
