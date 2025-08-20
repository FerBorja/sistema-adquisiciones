# sistema-adquisiciones/backend/requisitions/serializers.py
from django.db import transaction, IntegrityError
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

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

    def _require_user(self):
        req = self.context.get('request')
        user = getattr(req, 'user', None)
        if not getattr(user, 'is_authenticated', False):
            raise ValidationError({'detail': 'Usuario no autenticado.'})
        return user

    def create(self, validated_data):
        # ✅ Make sure 'user' does not get passed twice
        validated_data.pop('user', None)
        items_data = validated_data.pop('items', [])
        user = self._require_user()
        try:
            with transaction.atomic():
                requisition = Requisition.objects.create(user=user, **validated_data)
                for item_data in items_data:
                    RequisitionItem.objects.create(requisition=requisition, **item_data)
                return requisition
        except (IntegrityError, DjangoValidationError, ObjectDoesNotExist, TypeError, KeyError) as e:
            raise ValidationError({'detail': str(e)})

    def update(self, instance, validated_data):
        # ✅ Never allow 'user' to be overwritten via payload
        validated_data.pop('user', None)
        items_data = validated_data.pop('items', None)
        try:
            with transaction.atomic():
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()

                if items_data is not None:
                    existing = {it.id: it for it in instance.items.all()}
                    sent_ids = []
                    for row in items_data:
                        iid = row.get('id')
                        if iid and iid in existing:
                            it = existing[iid]
                            for a, v in row.items():
                                if a != 'id':
                                    setattr(it, a, v)
                            it.save()
                            sent_ids.append(iid)
                        else:
                            RequisitionItem.objects.create(requisition=instance, **row)
                    for iid, it in existing.items():
                        if iid not in sent_ids:
                            it.delete()
                return instance
        except (IntegrityError, DjangoValidationError, ObjectDoesNotExist, TypeError, KeyError) as e:
            raise ValidationError({'detail': str(e)})
