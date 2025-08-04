from rest_framework import viewsets, permissions
from requisitions.models import (
    Department, Project, FundingSource, BudgetUnit,
    Agreement, Category, Tender, ExternalService,
    UnitOfMeasurement, Product
)
from .serializers import (
    DepartmentSerializer, ProjectSerializer, FundingSourceSerializer, BudgetUnitSerializer,
    AgreementSerializer, CategorySerializer, TenderSerializer, ExternalServiceSerializer,
    UnitOfMeasurementSerializer, ProductSerializer
)

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated]

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
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]
