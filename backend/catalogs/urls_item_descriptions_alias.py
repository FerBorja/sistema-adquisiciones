from rest_framework.routers import DefaultRouter
from .views import ItemDescriptionViewSet

router = DefaultRouter()
router.register(r"item-descriptions", ItemDescriptionViewSet, basename="item-description")

urlpatterns = router.urls
