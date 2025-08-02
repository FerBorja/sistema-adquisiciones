from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RequisitionViewSet, RequisitionItemViewSet

router = DefaultRouter()
router.register(r'requisitions', RequisitionViewSet, basename='requisition')
router.register(r'requisition-items', RequisitionItemViewSet, basename='requisitionitem')

urlpatterns = [
    path('', include(router.urls)),
]
