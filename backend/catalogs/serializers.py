from rest_framework import serializers
from requisitions.models import (
    Department, Project, FundingSource, BudgetUnit,
    Agreement, Category, Tender, ExternalService,
    UnitOfMeasurement, Product, ItemDescription
)


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'


class ProjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Project
        fields = '__all__'


class FundingSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = FundingSource
        fields = '__all__'


class BudgetUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = BudgetUnit
        fields = '__all__'


class AgreementSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agreement
        fields = '__all__'


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = '__all__'


class TenderSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tender
        fields = '__all__'


class ExternalServiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExternalService
        fields = '__all__'


class UnitOfMeasurementSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitOfMeasurement
        fields = '__all__'


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'description']


class ItemDescriptionSerializer(serializers.ModelSerializer):
    created_by_email = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = ItemDescription
        fields = [
            'id',
            'product',
            'text',
            'estimated_unit_cost',   # ✅ costo del catálogo
            'created_by',            # ✅ auditoría
            'created_by_email',      # ✅ útil para UI
            'created_at',            # ✅ auditoría
        ]
        read_only_fields = ['id', 'created_by', 'created_by_email', 'created_at']

    def get_created_by_email(self, obj):
        return getattr(obj.created_by, "email", None)

    def validate_text(self, v):
        v = ' '.join((v or '').split())
        if not v:
            raise serializers.ValidationError('Este campo no puede estar vacío.')
        return v

    def validate_estimated_unit_cost(self, v):
        """
        ✅ Costo obligatorio SOLO al crear.
        """
        if self.instance is None:
            if v is None:
                raise serializers.ValidationError("El costo es obligatorio al registrar un nuevo artículo.")
            # (extra) por si llega 0 o negativo, mensaje más claro:
            if v <= 0:
                raise serializers.ValidationError("Captura un costo válido (> 0).")
        return v
