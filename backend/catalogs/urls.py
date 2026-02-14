# backend/catalogs/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    DepartmentViewSet, ProjectViewSet, FundingSourceViewSet, BudgetUnitViewSet,
    AgreementViewSet, CategoryViewSet, TenderViewSet, ExternalServiceViewSet,
    UnitOfMeasurementViewSet, ProductViewSet, ItemDescriptionViewSet
)

router = DefaultRouter()
router.register("departments", DepartmentViewSet)
router.register("projects", ProjectViewSet)
router.register("funding-sources", FundingSourceViewSet)
router.register("budget-units", BudgetUnitViewSet)
router.register("agreements", AgreementViewSet)
router.register("categories", CategoryViewSet)
router.register("tenders", TenderViewSet)
router.register("external-services", ExternalServiceViewSet)
router.register("units", UnitOfMeasurementViewSet)
router.register("products", ProductViewSet)

# Endpoint “oficial”
router.register("item-descriptions", ItemDescriptionViewSet, basename="item-descriptions")

# Alias para compatibilidad: /api/catalogs/descriptions/
router.register("descriptions", ItemDescriptionViewSet, basename="descriptions")

urlpatterns = [
    path("", include(router.urls)),
]
