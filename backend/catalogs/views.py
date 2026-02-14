# backend/catalogs/views.py
from rest_framework import viewsets, permissions, filters
from django_filters.rest_framework import DjangoFilterBackend

from requisitions.models import (
    Department, Project, FundingSource, BudgetUnit,
    Agreement, Category, Tender, ExternalService,
    UnitOfMeasurement, Product, ItemDescription
)
from .serializers import (
    DepartmentSerializer, ProjectSerializer, FundingSourceSerializer, BudgetUnitSerializer,
    AgreementSerializer, CategorySerializer, TenderSerializer, ExternalServiceSerializer,
    UnitOfMeasurementSerializer, ProductSerializer, ItemDescriptionSerializer
)

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [permissions.AllowAny()]
        return [permissions.IsAdminUser()]

class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [permissions.IsAuthenticated]

class FundingSourceViewSet(viewsets.ModelViewSet):
    queryset = FundingSource.objects.all()
    serializer_class = FundingSourceSerializer
    permission_classes = [permissions.IsAuthenticated]

class BudgetUnitViewSet(viewsets.ModelViewSet):
    queryset = BudgetUnit.objects.all()
    serializer_class = BudgetUnitSerializer
    permission_classes = [permissions.IsAuthenticated]

class AgreementViewSet(viewsets.ModelViewSet):
    queryset = Agreement.objects.all()
    serializer_class = AgreementSerializer
    permission_classes = [permissions.IsAuthenticated]

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]

class TenderViewSet(viewsets.ModelViewSet):
    queryset = Tender.objects.all()
    serializer_class = TenderSerializer
    permission_classes = [permissions.IsAuthenticated]

class ExternalServiceViewSet(viewsets.ModelViewSet):
    queryset = ExternalService.objects.all()
    serializer_class = ExternalServiceSerializer
    permission_classes = [permissions.IsAuthenticated]

class UnitOfMeasurementViewSet(viewsets.ModelViewSet):
    queryset = UnitOfMeasurement.objects.all()
    serializer_class = UnitOfMeasurementSerializer
    permission_classes = [permissions.IsAuthenticated]

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by("description")
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]

class ItemDescriptionViewSet(viewsets.ModelViewSet):
    queryset = (
        ItemDescription.objects
        .select_related("product", "created_by")
        .all()
        .order_by("text")
    )
    serializer_class = ItemDescriptionSerializer
    permission_classes = [permissions.IsAuthenticated]

    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["product"]
    search_fields = ["text"]
    ordering_fields = ["text", "id", "created_at"]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
