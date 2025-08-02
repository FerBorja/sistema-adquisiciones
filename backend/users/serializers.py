from rest_framework import serializers
from .models import User, RegistrationCode
from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.core.mail import send_mail

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'employee_number', 'first_name', 'last_name', 'department', 'email', 'extension_number', 'profile_picture')

class LoginSerializer(serializers.Serializer):
    employee_number = serializers.CharField()
    password = serializers.CharField()

    def validate(self, data):
        user = authenticate(username=data['employee_number'], password=data['password'])
        if user is None:
            raise serializers.ValidationError("Invalid credentials")
        if not user.is_active:
            raise serializers.ValidationError("Inactive account")
        refresh = RefreshToken.for_user(user)
        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user).data
        }

class RegistrationSerializer(serializers.ModelSerializer):
    code = serializers.UUIDField(write_only=True)
    password = serializers.CharField(write_only=True)
    confirm_password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('employee_number', 'first_name', 'last_name', 'department', 'extension_number',
                  'email', 'password', 'confirm_password', 'profile_picture', 'code')

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError("Passwords do not match")

        try:
            reg_code = RegistrationCode.objects.get(code=data['code'], email=data['email'])
        except RegistrationCode.DoesNotExist:
            raise serializers.ValidationError("Invalid registration code")

        if not reg_code.is_valid():
            raise serializers.ValidationError("Registration code is expired or already used")

        data['reg_code'] = reg_code
        return data

    def create(self, validated_data):
        validated_data.pop('confirm_password')
        reg_code = validated_data.pop('reg_code')
        validated_data.pop('code')

        user = User.objects.create_user(**validated_data)
        reg_code.used = True
        reg_code.save()
        return user
    
class SendCodeSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        # Opcional: validar que el correo pertenezca a la universidad
        if not value.endswith('@uach.mx'):
            raise serializers.ValidationError("El correo debe pertenecer a la universidad")
        return value

    def create(self, validated_data):
        email = validated_data['email']
        code = RegistrationCode.objects.create(email=email)

        # Enviar correo con el código
        send_mail(
            subject='Código de Registro - Sistema de Adquisiciones',
            message=f'Usa este código para registrarte: {code.code}\nEste código es válido por 1 hora y solo puede usarse una vez.',
            from_email=None,
            recipient_list=[email],
            fail_silently=False,
        )
        return code

class EmployeeNumberTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'employee_number'  # cambiar el campo por employee_number

    def validate(self, attrs):
        # attrs tiene: {'employee_number': '...', 'password': '...'}
        # SimpleJWT espera 'username', por eso lo mapeamos:
        attrs['username'] = attrs.get('employee_number')
        return super().validate(attrs)