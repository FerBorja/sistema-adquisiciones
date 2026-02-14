from django.contrib import admin
from django.urls import path, include
from users.views import EmployeeNumberTokenObtainPairView
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    path('admin/', admin.site.urls),

    # ✅ JWT primero
    path('api/token/', EmployeeNumberTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Rutas específicas
    path('api/users/', include('users.urls')),
    path('api/catalogs/', include('catalogs.urls')),
    path('api/reports/', include('reports.urls')),

    # ✅ Alias
    path('api/', include('catalogs.urls_item_descriptions_alias')),

    # ✅ Requisitions al final
    path('api/', include('requisitions.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
