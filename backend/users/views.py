from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import EmployeeNumberTokenObtainPairSerializer, RegistrationSerializer, SendCodeSerializer, UserSerializer
from .models import User
from rest_framework import generics, status
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.response import Response
from django.contrib.auth.models import User
from rest_framework.permissions import AllowAny, IsAuthenticated
from .throttles import PasswordResetThrottle, RegistrationThrottle
from django.core.mail import send_mail
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth import get_user_model
from rest_framework.views import APIView
import os

User = get_user_model()

class EmployeeNumberTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'employee_number'  # define el campo username

    def validate(self, attrs):
        # Mapea 'employee_number' a 'username' para que SimpleJWT funcione bien
        attrs['username'] = attrs.get('employee_number')
        return super().validate(attrs)

class EmployeeNumberTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmployeeNumberTokenObtainPairSerializer

class LoginView(TokenObtainPairView):
    serializer_class = EmployeeNumberTokenObtainPairSerializer

class RegisterView(generics.CreateAPIView):
    serializer_class = RegistrationSerializer
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationThrottle]

class SendCodeView(generics.CreateAPIView):
    serializer_class = SendCodeSerializer
    permission_classes = [AllowAny]

class PasswordResetRequestView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        if not email:
            return Response({"error": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Always respond success for security
            return Response({"message": "If the email exists, a reset link has been sent."})

        token_generator = PasswordResetTokenGenerator()
        token = token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))

        frontend_base_url = "http://localhost:3000/#"  # Change to your production frontend URL
        reset_url = f"{frontend_base_url}/change-password?uid={uid}&token={token}"

        # Send email
        send_mail(
            subject="Password Reset Request - Sistema de Adquisiciones",
            message=f"Use the following link to reset your password:\n{reset_url}\nThe link is valid for a limited time.",
            from_email=None,  # Uses DEFAULT_FROM_EMAIL
            recipient_list=[email],
            fail_silently=False,
        )

        return Response({"message": "If the email exists, a reset link has been sent."})


    
class PasswordResetConfirmView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [PasswordResetThrottle]

    def post(self, request, *args, **kwargs):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')

        if not all([uidb64, token, new_password, confirm_password]):
            return Response({"error": "All fields are required."}, status=status.HTTP_400_BAD_REQUEST)

        if new_password != confirm_password:
            return Response({"error": "Passwords do not match."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({"error": "Invalid reset link."}, status=status.HTTP_400_BAD_REQUEST)

        token_generator = PasswordResetTokenGenerator()
        if not token_generator.check_token(user, token):
            return Response({"error": "Invalid or expired token."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        return Response({"message": "Password has been reset successfully."})

    
class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

