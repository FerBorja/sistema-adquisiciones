from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin, AbstractUser
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
import uuid
from datetime import timedelta

class UserManager(BaseUserManager):
    def create_user(self, employee_number, first_name, last_name, extension_number, email, department=None, profile_picture=None, password=None, **extra_fields):
        if not employee_number:
            raise ValueError("El número de empleado es obligatorio")
        if not extension_number:
            raise ValueError("El número de extensión es obligatorio")
        if not email:
            raise ValueError("El correo electrónico es obligatorio")

        email = self.normalize_email(email)
        user = self.model(
            employee_number=employee_number,
            first_name=first_name,
            last_name=last_name,
            extension_number=extension_number,
            email=email,
            department=department,
            profile_picture=profile_picture,
            **extra_fields
        )
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, employee_number, first_name, last_name, extension_number, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)        

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser debe tener is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser debe tener is_superuser=True.')

        return self.create_user(
            employee_number=employee_number,
            first_name=first_name,
            last_name=last_name,
            extension_number=extension_number,
            email=email,
            password=password,
            **extra_fields
        )

class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = (
        ('user', 'Usuario'),
        ('admin', 'Administrador'),
        ('superuser', 'Superusuario'),
    )

    employee_number = models.CharField(max_length=10, unique=True)
    first_name = models.CharField(max_length=150)
    last_name = models.CharField(max_length=150)
    extension_number = models.CharField(max_length=10, blank=True, null=True)
    email = models.EmailField(unique=True)
    department = models.CharField(max_length=150, null=True, blank=True)
    profile_picture = models.ImageField(upload_to='profile_pictures/', null=True, blank=True)

    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = 'employee_number'
    REQUIRED_FIELDS = ['first_name', 'last_name', 'extension_number', 'email']

    def __str__(self):
        return f"{self.employee_number} - {self.first_name} {self.last_name}"
    
    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    def clean(self):
        if not self.extension_number.isdigit():
            raise ValidationError("El número de extensión debe contener solo dígitos.")

class RegistrationCode(models.Model):
    email = models.EmailField()
    code = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    used = models.BooleanField(default=False)

    def is_valid(self):
        expiration_time = self.created_at + timedelta(hours=1)
        return (not self.used) and (timezone.now() < expiration_time)

    def __str__(self):
        return f"{self.email} - {self.code} - Used: {self.used}"