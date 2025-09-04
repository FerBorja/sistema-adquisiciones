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


class RequisitionsByUnitView(APIView):
    """
    Totales por Departamento (antes: Unidad Administrativa)
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
        # Renombrar clave para el frontend
        result = [{
            'requesting_department': item['requesting_department__name'] or '—',
            'total': item['total'],
        } for item in data]
        return Response(result)


class RequisitionsByMonthAndUnitView(APIView):
    """
    Serie por mes y Departamento (antes: Unidad Administrativa)
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
    Totales por Categoría (sin cambios)
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
    PDF simple de resumen. Ahora agrupa por Departamento.
    GET /api/reports/summary-pdf/
    """
    permission_classes = [IsAdminUser]

    def get(self, request):
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        from io import BytesIO

        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, height - 50, "Reporte de Requisiciones por Departamento")

        data = (
            Requisition.objects
            .values('requesting_department__name')
            .annotate(total=Count('id'))
            .order_by('requesting_department__name')
        )

        y = height - 80
        p.setFont("Helvetica", 12)
        for item in data:
            dep = item['requesting_department__name'] or '—'
            p.drawString(50, y, f"{dep}: {item['total']}")
            y -= 20
            if y < 50:
                p.showPage()
                p.setFont("Helvetica", 12)
                y = height - 50

        p.showPage()
        p.save()
        buffer.seek(0)
        return HttpResponse(buffer, content_type='application/pdf')


class ReportsViewSet(viewsets.ViewSet):
    """
    PDF detallado (tabla) – sin cambio de firma.
    El diseño del PDF (encabezados/agrupaciones) se actualiza en pdf_generator.py
    si quieres que también muestre/agrupé por Departamento.
    """
    permission_classes = [permissions.IsAdminUser]

    @action(detail=False, methods=['get'])
    def requisitions_report(self, request):
        requisitions = Requisition.objects.all().order_by('-created_at')
        pdf_buffer = generate_requisition_report_pdf(requisitions)
        return HttpResponse(pdf_buffer, content_type='application/pdf')
