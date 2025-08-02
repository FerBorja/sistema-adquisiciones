from django.shortcuts import render

from rest_framework import viewsets, permissions
from .models import Requisition, RequisitionItem
from .serializers import RequisitionSerializer, RequisitionItemSerializer
from rest_framework.pagination import PageNumberPagination

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

class RequisitionItemViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        return RequisitionItem.objects.filter(requisition__user=self.request.user)
