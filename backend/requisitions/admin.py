from django.contrib import admin
from .models import Department, Project, FundingSource, BudgetUnit, Agreement, Category, Tender, ExternalService, UnitOfMeasurement, Product, Requisition, RequisitionItem

admin.site.register([
    Department, Project, FundingSource, BudgetUnit, Agreement, Category, Tender, ExternalService, UnitOfMeasurement, Product, Requisition, RequisitionItem
])
from django.contrib import admin

# Register your models here.
