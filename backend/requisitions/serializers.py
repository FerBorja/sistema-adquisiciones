from rest_framework import serializers
from .models import Requisition, RequisitionItem

class RequisitionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = RequisitionItem
        fields = '__all__'
        read_only_fields = ['id', 'requisition']

class RequisitionSerializer(serializers.ModelSerializer):
    items = RequisitionItemSerializer(many=True, required=False)

    class Meta:
        model = Requisition
        fields = '__all__'
        read_only_fields = ['id', 'user', 'created_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items', [])
        user = self.context['request'].user
        validated_data.pop('user', None)
        requisition = Requisition.objects.create(user=user, **validated_data)
        for item_data in items_data:
            RequisitionItem.objects.create(requisition=requisition, **item_data)
        return requisition
