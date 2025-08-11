from django.urls import path
from .views import (
    RequisitionsByUnitView,
    RequisitionsByMonthAndUnitView,
    RequisitionsByCategoryView,
    RequisitionSummaryPDFView,
    ReportsViewSet,
)

reports_list = ReportsViewSet.as_view({'get': 'requisitions_report'})

urlpatterns = [
    path('by-unit/', RequisitionsByUnitView.as_view(), name='requisitions-by-unit'),
    path('by-month-unit/', RequisitionsByMonthAndUnitView.as_view(), name='requisitions-by-month-unit'),
    path('by-category/', RequisitionsByCategoryView.as_view(), name='requisitions-by-category'),
    path('summary-pdf/', RequisitionSummaryPDFView.as_view(), name='requisitions-summary-pdf'),
    path('requisitions-report/', reports_list, name='requisitions-report'),
]
