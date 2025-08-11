from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from requisitions.models import Requisition
from django.db.models import Count
from django.utils.dateparse import parse_date
from django.db.models.functions import TruncMonth
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from io import BytesIO
from django.http import HttpResponse
from rest_framework.decorators import action
from rest_framework import viewsets, permissions
from requisitions.models import Requisition
from .pdf_generator import generate_requisition_report_pdf


class RequisitionsByUnitView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        data = (
            Requisition.objects
            .values('administrative_unit')
            .annotate(total=Count('id'))
            .order_by('administrative_unit')
        )
        return Response(data)


class RequisitionsByMonthAndUnitView(APIView):
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
            .values('month', 'administrative_unit')
            .annotate(total=Count('id'))
            .order_by('month', 'administrative_unit')
        )
        # Format month as string for JSON
        result = [{
            'month': item['month'].strftime('%Y-%m'),
            'administrative_unit': item['administrative_unit'],
            'total': item['total'],
        } for item in data]

        return Response(result)


class RequisitionsByCategoryView(APIView):
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
    permission_classes = [IsAdminUser]

    def get(self, request):
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        p.setFont("Helvetica-Bold", 16)
        p.drawString(50, height - 50, "Reporte de Requisiciones por Unidad Administrativa")

        data = Requisition.objects.values('administrative_unit').annotate(total=Count('id')).order_by('administrative_unit')

        y = height - 80
        p.setFont("Helvetica", 12)
        for item in data:
            p.drawString(50, y, f"{item['administrative_unit']}: {item['total']}")
            y -= 20
            if y < 50:
                p.showPage()
                y = height - 50

        p.showPage()
        p.save()
        buffer.seek(0)
        return HttpResponse(buffer, content_type='application/pdf')
    
class ReportsViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAdminUser]

    @action(detail=False, methods=['get'])
    def requisitions_report(self, request):
        # Get all requisitions or filter by some criteria if you want
        requisitions = Requisition.objects.all().order_by('-created_at')

        pdf_buffer = generate_requisition_report_pdf(requisitions)

        return HttpResponse(pdf_buffer, content_type='application/pdf')

