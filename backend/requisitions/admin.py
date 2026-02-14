# backend/requisitions/admin.py
from django.contrib import admin
from .models import (
    Department, Project, FundingSource, BudgetUnit, Agreement, Category,
    Tender, ExternalService, UnitOfMeasurement, Product, ItemDescription,
    Requisition, RequisitionItem,
    RequisitionRealAmountLog,  # ✅ NUEVO
)

# ---------- Catalog admins (searchable) ----------

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("code", "name")
    search_fields = ("code", "name")


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code", "description")


@admin.register(FundingSource)
class FundingSourceAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code", "description")


@admin.register(BudgetUnit)
class BudgetUnitAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code", "description")


@admin.register(Agreement)
class AgreementAdmin(admin.ModelAdmin):
    list_display = ("code", "description")
    search_fields = ("code", "description")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Tender)
class TenderAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(ExternalService)
class ExternalServiceAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(UnitOfMeasurement)
class UnitOfMeasurementAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("description",)
    search_fields = ("description",)


@admin.register(ItemDescription)
class ItemDescriptionAdmin(admin.ModelAdmin):
    list_display = ("text",)
    search_fields = ("text",)


# ---------- Inline for items inside Requisition ----------

class RequisitionItemInline(admin.TabularInline):
    model = RequisitionItem
    extra = 1
    # Use autocomplete for big catalogs (these require search_fields in their admins)
    autocomplete_fields = ("product", "unit",)
    # IMPORTANT: keep "description" (ItemDescription) as a normal select so the green (+) shows up.
    # If your ItemDescription list gets huge, switch to raw_id_fields instead of autocomplete:
    # raw_id_fields = ("description",)


# ---------- Main admins ----------

@admin.register(Requisition)
class RequisitionAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "requesting_department", "status", "created_at")
    list_filter = ("status", "requesting_department", "created_at")
    date_hierarchy = "created_at"
    search_fields = ("id__exact", "requisition_reason")
    autocomplete_fields = (
        "project", "funding_source", "budget_unit", "agreement",
        "category", "external_service", "tender", "requesting_department",
    )
    inlines = [RequisitionItemInline]


@admin.register(RequisitionItem)
class RequisitionItemAdmin(admin.ModelAdmin):
    list_display = ("requisition", "product", "quantity", "unit", "description")
    search_fields = ("product__description", "description__text", "requisition__id")
    # Enable autocomplete for heavy FKs; keep 'description' as regular select for (+)
    autocomplete_fields = ("requisition", "product", "unit",)
    # If Requisition list is huge, raw id is fine:
    # raw_id_fields = ("requisition",)


# ---------- ✅ Auditoría: Real Amount Logs ----------

@admin.register(RequisitionRealAmountLog)
class RequisitionRealAmountLogAdmin(admin.ModelAdmin):
    list_display = ("id", "requisition", "old_value", "new_value", "changed_by", "changed_at")
    list_filter = ("changed_at", "changed_by")
    search_fields = ("requisition__id", "changed_by__email", "reason")
    readonly_fields = ("requisition", "old_value", "new_value", "reason", "changed_by", "changed_at")
    ordering = ("-changed_at",)

    # (Opcional) evita que se creen/editen logs manualmente desde admin
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
