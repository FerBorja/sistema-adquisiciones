from django.contrib import admin
from django.urls import path, include
from users.views import EmployeeNumberTokenObtainPairView
from django.conf import settings
from django.conf.urls.static import static
from django.shortcuts import redirect

def admin_redirect(request):
    return redirect('/admin/users/user/')

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('admin/', admin_redirect),
    path('api/users/', include('users.urls')),
    path('api/', include('requisitions.urls')),
    path('api/token/', EmployeeNumberTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/catalogs/', include('catalogs.urls')),
    path('api/reports/', include('reports.urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
