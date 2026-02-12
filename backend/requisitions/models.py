from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models.functions import Lower

User = settings.AUTH_USER_MODEL


class Department(models.Model):
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=150)

    def __str__(self):
        return f"{self.code} – {self.name}"


class Project(models.Model):
    code = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.code} – {self.description}"


class FundingSource(models.Model):
    code = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.code} – {self.description}"


class BudgetUnit(models.Model):
    code = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.code} – {self.description}"


class Agreement(models.Model):
    code = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=255)

    def __str__(self):
        return f"{self.code} – {self.description}"


class Category(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Tender(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class ExternalService(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class UnitOfMeasurement(models.Model):
    name = models.CharField(max_length=50)

    def __str__(self):
        return self.name


class Product(models.Model):
    # Catálogo de textos que alimenta "Objeto del Gasto"
    description = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.description


class ItemDescription(models.Model):
    product = models.ForeignKey('Product', on_delete=models.CASCADE, related_name='descriptions')
    text = models.CharField(max_length=255)

    # ✅ costo estimado unitario (catálogo de precios)
    estimated_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower('text'), 'product', name='uniq_itemdesc_product_text_ci'
            ),
        ]

    def __str__(self):
        return f"{self.product.description} – {self.text}"


class Requisition(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('registered', 'Registered'),
        ('completed', 'Completed'),
        ('sent', 'Sent to Central Unit'),
        ('received', 'Received by Admin Office'),
        ('cancelled', 'Cancelled'),  # ✅ NUEVO
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    administrative_unit = models.CharField(
        max_length=255,
        default="4400 FACULTAD DE INGENIERIA",
        editable=False
    )
    requesting_department = models.ForeignKey(Department, on_delete=models.PROTECT)
    project = models.ForeignKey(Project, on_delete=models.PROTECT)
    funding_source = models.ForeignKey(FundingSource, on_delete=models.PROTECT)
    budget_unit = models.ForeignKey(BudgetUnit, on_delete=models.PROTECT)
    agreement = models.ForeignKey(Agreement, on_delete=models.PROTECT)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    external_service = models.ForeignKey(ExternalService, on_delete=models.PROTECT)
    tender = models.ForeignKey(Tender, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    requisition_reason = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='registered')
    observations = models.TextField(blank=True, null=True)

    # ✅ confirmación “costo aproximado pero realista”
    ack_cost_realistic = models.BooleanField(default=False)

    # ✅ cancelación (admin)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cancelled_requisitions"
    )
    cancel_reason = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Requisition"
        verbose_name_plural = "Requisitions"
        ordering = ['-created_at']

    def __str__(self):
        return f"Req #{self.id} by {getattr(self.user, 'full_name', self.user)}"


class RequisitionItem(models.Model):
    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)  # "Objeto del Gasto"
    quantity = models.PositiveIntegerField()
    unit = models.ForeignKey(UnitOfMeasurement, on_delete=models.PROTECT)
    description = models.ForeignKey(ItemDescription, on_delete=models.PROTECT)

    # ✅ monto por renglón (obligatorio)
    estimated_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    # ✅ opcional: unitario estimado
    estimated_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
    )

    # ✅ admin: monto real (trazabilidad)
    real_total = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    real_unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01"))],
    )
    real_updated_at = models.DateTimeField(null=True, blank=True)
    real_updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="real_amount_updates"
    )

    class Meta:
        verbose_name = "Requisition Item"
        verbose_name_plural = "Requisition Items"

    def __str__(self):
        return f"{self.product.description} ({self.quantity} {self.unit.name}) - {self.description.text}"
