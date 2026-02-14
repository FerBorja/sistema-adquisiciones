from django.contrib import admin
from django.urls import path, include
from users.views import EmployeeNumberTokenObtainPairView
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),

    # ✅ JWT primero (ANTES del include('api/'))
    path('api/token/', EmployeeNumberTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Rutas específicas
    path('api/users/', include('users.urls')),
    path('api/catalogs/', include('catalogs.urls')),
    path('api/reports/', include('reports.urls')),

    # ✅ Alias: /api/item-descriptions/ (compatibilidad opcional)
    path('api/', include('catalogs.urls_item_descriptions_alias')),

    # ✅ Este al final (para no “tragarse” /api/token/)
    path('api/', include('requisitions.urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
