from django.urls import path
from .views import (
    LoginView,
    RegisterView,
    SendCodeView,
    EmployeeNumberTokenObtainPairView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    UserProfileView,
)

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('register/', RegisterView.as_view(), name='register'),
    path('send-code/', SendCodeView.as_view(), name='send-code'),   
    path('api/token/', EmployeeNumberTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password_reset'),
    path('password-reset-confirm/', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('me/', UserProfileView.as_view(), name='user-profile'),
]
