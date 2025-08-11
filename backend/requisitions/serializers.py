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
        requisition = Requisition.objects.create(user=user, **validated_data)
        for item_data in items_data:
            RequisitionItem.objects.create(requisition=requisition, **item_data)
        return requisition

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)

        # Update requisition fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if items_data is not None:
            # Map existing items by id for quick lookup
            existing_items = {item.id: item for item in instance.items.all()}
            sent_item_ids = []

            for item_data in items_data:
                item_id = item_data.get('id', None)
                if item_id and item_id in existing_items:
                    # Update existing item
                    item = existing_items[item_id]
                    for attr, value in item_data.items():
                        if attr != 'id':
                            setattr(item, attr, value)
                    item.save()
                    sent_item_ids.append(item_id)
                else:
                    # Create new item linked to requisition
                    RequisitionItem.objects.create(requisition=instance, **item_data)

            # Delete any existing items not sent in update request
            for item_id, item in existing_items.items():
                if item_id not in sent_item_ids:
                    item.delete()

        return instance
