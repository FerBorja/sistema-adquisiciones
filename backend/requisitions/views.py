from django.shortcuts import render
from rest_framework import viewsets, permissions, status
from .models import Requisition, RequisitionItem
from .serializers import RequisitionSerializer, RequisitionItemSerializer
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from io import BytesIO
from django.http import HttpResponse
from django.conf import settings
import os
from datetime import datetime
from reportlab.platypus import Table, TableStyle
from reportlab.lib import colors


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100

class RequisitionViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return Requisition.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def export_pdf(self, request, pk=None):
        requisition = self.get_object()

        # Verify user owns this requisition or has permission (already enforced by get_queryset)
        
        buffer = BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # Paths
        logo_path = os.path.join(settings.BASE_DIR, 'staticfiles', 'uach_logo.png')  # Adjust as needed

        # Margins
        margin_left = 50
        margin_top = height - 50

        # Header
        p.setFont("Helvetica-Bold", 14)
        p.drawString(margin_left, margin_top, "Integrated Purchasing System - Fing")
        p.setFont("Helvetica", 12)
        p.drawString(margin_left, margin_top - 20, "Autonomous University of Chihuahua – Requisition")

        # Logo
        if os.path.exists(logo_path):
            p.drawImage(logo_path, x=500, y=height - 80, width=100, height=50, preserveAspectRatio=True, mask='auto')
        else:
            print("Logo file NOT found at:", logo_path)   

        # Line
        p.line(margin_left, margin_top - 60, width - margin_left, margin_top - 60)

        y = margin_top - 80
        line_height = 16

        # Requisition header info
        p.setFont("Helvetica-Bold", 12)
        p.drawString(margin_left, y, f"Requisition No. {requisition.id} - Registration Information")
        y -= line_height * 2

        p.setFont("Helvetica", 10)
        fields = [
            ("Administrative Unit", requisition.administrative_unit),
            ("Requesting Department", str(requisition.requesting_department)),
            ("Project", str(requisition.project)),
            ("Funding Source", str(requisition.funding_source)),
            ("Budget Unit", str(requisition.budget_unit)),
            ("Agreements", str(requisition.agreement)),
            ("Category", str(requisition.category)),
            ("Date", requisition.created_at.strftime("%d/%b/%Y")),
            ("Requisition Reason", requisition.requisition_reason),
            ("External / Academic Service", str(requisition.external_service)),
            ("Bidding", str(requisition.tender)),
            ("Requester", requisition.user.full_name),
        ]

        for label, value in fields:
            p.drawString(margin_left, y, f"{label}: {value}")
            y -= line_height

        y -= line_height

        p.setFont("Helvetica", 10)

        # Prepare data for table including header
        items_data = [
            ['Expense Object', 'Quantity', 'Unit', 'Description']
        ]

        for item in requisition.items.all():
            items_data.append([
                item.product.expense_object.name,
                str(item.quantity),
                item.unit.name,
                item.description
            ])

        # Create the table
        table = Table(items_data, colWidths=[150, 60, 60, 210])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.lightblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ]))

        # Calculate table height and position
        table_width, table_height = table.wrap(0, 0)
        table_x = margin_left
        # Since drawOn uses bottom-left corner, subtract height from y
        table_y = y - table_height

        # Draw table
        table.drawOn(p, table_x, table_y)

        # Update y to below the table for further content
        y = table_y - line_height

        y -= line_height * 2

        # Signature fields
        p.setFont("Helvetica-Bold", 12)
        p.drawString(margin_left, y, "Signatures:")
        y -= line_height * 1.5

        sig_labels = [
            "Requested by:",
            "Reviewed by: M.I. Arion Ehecatl Juárez Menchaca",
            "Authorized by: M.I. Adrián Isaac Orpinel Uren"
        ]
        p.setFont("Helvetica", 10)
        for label in sig_labels:
            p.drawString(margin_left, y, label)
            p.line(margin_left + 120, y - 3, margin_left + 350, y - 3)  # Signature line
            y -= line_height * 2

        # Y-position of the footer text (adjust as needed)
        footer_y = 50

        # Draw the address block, line by line, just above footer
        address_lines = [
            "FACULTAD DE INGENIERÍA",
            "Circuito No. 1, Campus Universitario 2",
            "Chihuahua, Chih. México. C.P. 31125",
            "Tel. (614) 442-95-00",
            "www.uach.mx/fing"
        ]

        # Starting Y position for the address block (a bit above footer_y)
        address_start_y = footer_y + 60

        p.setFont("Helvetica", 9)
        line_height = 12  # space between lines

        for i, line in enumerate(address_lines):
            p.drawString(50, address_start_y - i * line_height, line)    

        # Footer
        footer_text = f"Generated by {requisition.user.full_name} - {requisition.administrative_unit}"
        print_date = datetime.now().strftime("%d/%b/%Y %H:%M")
        p.setFont("Helvetica-Oblique", 8)
        p.drawString(margin_left, 40, footer_text)
        p.drawRightString(width - margin_left, 40, f"Print date: {print_date}")

        # Finish up
        p.showPage()
        p.save()

        buffer.seek(0)
        return HttpResponse(buffer, content_type='application/pdf')

class RequisitionItemViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return RequisitionItem.objects.filter(requisition__user=self.request.user)
