from rest_framework import serializers
from requisitions.models import (
    Department, Project, FundingSource, BudgetUnit,
    Agreement, Category, Tender, ExternalService,
    UnitOfMeasurement, Product
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
        fields = '__all__'
