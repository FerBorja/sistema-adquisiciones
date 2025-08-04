from django.db import models
from django.conf import settings

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
    expense_object = models.ForeignKey(Category, on_delete=models.CASCADE)
    description = models.CharField(max_length=255)

    def __str__(self):
        return self.description

class Requisition(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('registered', 'Registered'),
        ('completed', 'Completed'),
        ('sent', 'Sent to Central Unit'),
        ('received', 'Received by Admin Office'),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE)
    administrative_unit = models.CharField(max_length=255, default="4400 FACULTAD DE INGENIERIA", editable=False)
    requesting_department = models.ForeignKey(Department, on_delete=models.PROTECT)
    project = models.ForeignKey(Project, on_delete=models.PROTECT)
    funding_source = models.ForeignKey(FundingSource, on_delete=models.PROTECT)
    budget_unit = models.ForeignKey(BudgetUnit, on_delete=models.PROTECT)
    agreement = models.ForeignKey(Agreement, on_delete=models.PROTECT)
    category = models.ForeignKey(Category, on_delete=models.PROTECT)
    external_service = models.ForeignKey(ExternalService, on_delete=models.PROTECT)
    tender = models.ForeignKey(Tender, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    requisition_reason = models.TextField()
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='registered')

    class Meta:
        verbose_name = "Requisition"
        verbose_name_plural = "Requisitions"
        ordering = ['-created_at']

    def __str__(self):
        return f"Req #{self.id} by {self.user.full_name}"

class RequisitionItem(models.Model):
    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    unit = models.ForeignKey(UnitOfMeasurement, on_delete=models.PROTECT)
    description = models.CharField(max_length=255)  # Can be product description or additional info

    class Meta:
        verbose_name = "Requisition Item"
        verbose_name_plural = "Requisition Items"

    def __str__(self):
        return f"{self.product.description} ({self.quantity} {self.unit.name})"
