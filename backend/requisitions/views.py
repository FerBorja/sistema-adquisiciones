# sistema-adquisiciones/backend/requisitions/views.py
from rest_framework import viewsets, permissions, status, filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse

from .models import Requisition, RequisitionItem
from .serializers import RequisitionSerializer, RequisitionItemSerializer
from .pdf_generator import generate_requisition_pdf

import traceback


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class RequisitionViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]

    filterset_fields = ['status', 'requesting_department', 'project', 'created_at']
    ordering_fields = ['id', 'created_at', 'status']
    search_fields = ['requisition_reason']

    def get_queryset(self):
        # Return only requisitions belonging to the authenticated user
        return Requisition.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        # Ensure the authenticated user is set server-side
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def export_pdf(self, request, pk=None):
        requisition = self.get_object()
        try:
            buf = generate_requisition_pdf(requisition)
            resp = HttpResponse(buf.getvalue(), content_type='application/pdf')
            # Open inline in the browser tab with a friendly filename
            resp['Content-Disposition'] = f'inline; filename="requisicion_{requisition.id}.pdf"'
            return resp
        except Exception as e:
            # Log full traceback to server console and return readable error to client
            traceback.print_exc()
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class RequisitionItemViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        # Return only items for requisitions belonging to the authenticated user
        return RequisitionItem.objects.filter(requisition__user=self.request.user)
