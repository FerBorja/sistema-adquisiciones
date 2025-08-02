from django.db import models
from django.contrib.auth import get_user_model
from django.conf import settings

User = get_user_model()

class Requisition(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    administrative_unit = models.CharField(max_length=255, default="4400 FACULTAD DE INGENIERIA")
    project_name = models.CharField(max_length=255)
    income_source = models.CharField(max_length=255)
    budget_unit = models.CharField(max_length=255, default="4400 FACULTAD DE INGENIERIA")
    contract = models.CharField(max_length=255)
    category = models.CharField(max_length=255)
    external_service = models.CharField(max_length=255, default="UNIDAD ACADEMICA")
    tender = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Requisition"
        verbose_name_plural = "Requisitions"
        ordering = ['-created_at']  # newest first

    def __str__(self):
        return f"Req #{self.id} by {self.user}"

class RequisitionItem(models.Model):
    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='items')
    item_name = models.CharField(max_length=255)
    unit_type = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        verbose_name = "Requisition Item"
        verbose_name_plural = "Requisition Items"

    def __str__(self):
        return self.item_name
    
