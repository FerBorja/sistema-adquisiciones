from rest_framework_simplejwt.views import TokenObtainPairView
from .serializers import EmployeeNumberTokenObtainPairSerializer, RegistrationSerializer, SendCodeSerializer
from .models import User
from rest_framework import generics
from rest_framework import status
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework.response import Response
from django.contrib.auth.models import User

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

class SendCodeView(generics.CreateAPIView):
    serializer_class = SendCodeSerializer

class PasswordResetRequestView(generics.GenericAPIView):
    def post(self, request, *args, **kwargs):
        email = request.data.get('email')
        # Aquí implementas lógica para enviar email con código o link
        # Por ahora solo simulamos la respuesta:
        if email:
            return Response({"message": "Email de restablecimiento enviado si el usuario existe."})
        return Response({"error": "Email es requerido."}, status=status.HTTP_400_BAD_REQUEST)
    
class PasswordResetConfirmView(generics.GenericAPIView):
    def post(self, request, *args, **kwargs):
        # Aquí irá la lógica de confirmar el cambio de contraseña
        return Response({"message": "Contraseña restablecida correctamente."}, status=status.HTTP_200_OK)
