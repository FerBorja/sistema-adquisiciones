from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, RegistrationCode

class UserAdmin(BaseUserAdmin):
    list_display = (
        'employee_number', 'first_name', 'last_name', 'email',
        'department', 'extension_number', 'role', 'is_active', 'is_staff'
    )
    search_fields = ('employee_number', 'first_name', 'last_name', 'email', 'department')
    ordering = ('employee_number',)
    list_filter = ('role', 'is_active', 'is_staff', 'is_superuser')
    readonly_fields = ('last_login', 'date_joined')

    fieldsets = (
        (None, {'fields': ('employee_number', 'password')}),
        ('Información personal', {
            'fields': (
                'first_name', 'last_name', 'email', 'extension_number',
                'department', 'profile_picture', 'role'
            )
        }),
        ('Permisos', {
            'fields': (
                'is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions'
            )
        }),
        ('Fechas importantes', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': (
                'employee_number', 'first_name', 'last_name', 'email',
                'extension_number', 'department', 'profile_picture',
                'role', 'password1', 'password2'
            ),
        }),
    )

admin.site.register(User, UserAdmin)
admin.site.register(RegistrationCode)
