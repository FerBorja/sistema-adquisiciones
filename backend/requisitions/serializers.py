# sistema-adquisiciones/backend/requisitions/serializers.py

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction, IntegrityError
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import Requisition, RequisitionItem, RequisitionRealAmountLog


def _money2(value: Decimal) -> Decimal:
    """
    Normaliza a 2 decimales para montos (evita floats).
    """
    if value is None:
        return value
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class RequisitionItemSerializer(serializers.ModelSerializer):
    # ✅ Permitimos id en payload para UPDATE de nested items
    id = serializers.IntegerField(required=False)

    class Meta:
        model = RequisitionItem
        fields = "__all__"
        read_only_fields = ["requisition"]  # OJO: NO pongas 'id' aquí

    def validate(self, attrs):
        """
        Candado de 'monto por renglón' (estimated_total):
        - Si viene estimated_total: validar > 0.
        - Si NO viene: intentar calcularlo desde:
            a) estimated_unit_cost (payload), o
            b) description.estimated_unit_cost (catálogo)
          y quantity.
        """
        qty = attrs.get("quantity")
        est_total = attrs.get("estimated_total", None)
        est_unit = attrs.get("estimated_unit_cost", None)
        desc = attrs.get("description", None)

        # Normalizar unit/total si vienen
        if est_total is not None:
            est_total = _money2(est_total)
            attrs["estimated_total"] = est_total

        if est_unit is not None:
            est_unit = _money2(est_unit)
            attrs["estimated_unit_cost"] = est_unit

        # --- Si estimated_total NO viene, intentamos calcularlo ---
        if est_total is None:
            # 1) unit cost desde payload si viene
            unit_cost = est_unit

            # 2) si no, unit cost desde catálogo (ItemDescription.estimated_unit_cost)
            if unit_cost is None and desc is not None:
                cat_cost = getattr(desc, "estimated_unit_cost", None)
                if cat_cost is not None:
                    unit_cost = _money2(cat_cost)
                    attrs["estimated_unit_cost"] = unit_cost

            # 3) calcular total si se puede
            if unit_cost is not None and qty is not None:
                total = _money2(unit_cost * Decimal(qty))
                attrs["estimated_total"] = total
            else:
                raise ValidationError({
                    "estimated_total": (
                        "Este campo es obligatorio por renglón. "
                        "Puedes enviarlo directamente o permitir que se calcule "
                        "desde estimated_unit_cost o desde el costo del catálogo (ItemDescription.estimated_unit_cost)."
                    )
                })

        # --- Validación mínima: evitar 0 o negativos ---
        if attrs.get("estimated_total") is not None and attrs["estimated_total"] <= Decimal("0.00"):
            raise ValidationError({"estimated_total": "Debe ser mayor a 0."})

        # Opcional: si viene unitario, evitar 0 o negativos
        if attrs.get("estimated_unit_cost") is not None and attrs["estimated_unit_cost"] <= Decimal("0.00"):
            raise ValidationError({"estimated_unit_cost": "Debe ser mayor a 0."})

        return attrs


class RequisitionRealAmountLogSerializer(serializers.ModelSerializer):
    changed_by_email = serializers.SerializerMethodField()

    class Meta:
        model = RequisitionRealAmountLog
        fields = ["id", "old_value", "new_value", "reason", "changed_by", "changed_by_email", "changed_at"]
        read_only_fields = fields

    def get_changed_by_email(self, obj):
        user = getattr(obj, "changed_by", None)
        return getattr(user, "email", None) if user else None


class RequisitionSerializer(serializers.ModelSerializer):
    items = RequisitionItemSerializer(many=True, required=False)

    # ✅ Solo lectura aquí: para mantener auditoría obligatoria (solo se cambia via endpoint set_real_amount)
    real_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    # ✅ Historial (solo lectura)
    real_amount_logs = RequisitionRealAmountLogSerializer(many=True, read_only=True)

    class Meta:
        model = Requisition
        fields = "__all__"
        read_only_fields = ["id", "user", "created_at"]

    def _require_user(self):
        req = self.context.get("request")
        user = getattr(req, "user", None)
        if not getattr(user, "is_authenticated", False):
            raise ValidationError({"detail": "Usuario no autenticado."})
        return user

    def _assert_ready_to_send(self, instance=None, incoming=None, items_data=None):
        """
        Candado de "ENVIAR":
        No permitir status='sent' si:
          - ack_cost_realistic == False
          - no hay items
          - algún item no tiene estimated_total > 0
        """
        incoming = incoming or {}
        target_status = incoming.get("status", None)

        # Solo aplica si intentan poner sent
        if target_status != "sent":
            return

        # ack_cost_realistic: si viene en payload úsalo; si no, toma del instance
        if "ack_cost_realistic" in incoming:
            ack = bool(incoming.get("ack_cost_realistic"))
        else:
            ack = bool(getattr(instance, "ack_cost_realistic", False)) if instance else False

        if not ack:
            raise ValidationError({
                "ack_cost_realistic": "Debes confirmar 'costo aproximado pero realista' para poder ENVIAR."
            })

        # Determinar items: si vienen en payload usa esos; si no, toma los existentes
        if items_data is not None:
            items = items_data
        else:
            items = list(instance.items.all().values("estimated_total")) if instance else []

        if not items or len(items) == 0:
            raise ValidationError({"items": "No se puede ENVIAR una requisición sin renglones (items)."})

        # Validar estimated_total por renglón
        bad_idx = []
        for idx, it in enumerate(items, start=1):
            est_total = it.get("estimated_total") if isinstance(it, dict) else getattr(it, "estimated_total", None)
            if est_total in (None, ""):
                bad_idx.append(idx)
                continue
            try:
                est_total_dec = Decimal(str(est_total))
            except Exception:
                bad_idx.append(idx)
                continue
            if est_total_dec <= Decimal("0.00"):
                bad_idx.append(idx)

        if bad_idx:
            raise ValidationError({
                "items": f"No se puede ENVIAR: hay renglones sin monto válido (estimated_total) en posiciones: {bad_idx}."
            })

    def validate(self, attrs):
        # ✅ Bloqueo duro: real_amount NO se edita por este serializer (ni admin), para no saltarse auditoría
        req = self.context.get("request")
        data = getattr(req, "data", {}) if req is not None else {}
        if isinstance(data, dict) and "real_amount" in data:
            raise ValidationError({
                "real_amount": (
                    "El monto real NO se edita por este endpoint. "
                    "Usa POST /api/requisitions/{id}/set_real_amount/ (con reason) para dejar auditoría."
                )
            })

        # Candado de envío por status
        instance = getattr(self, "instance", None)
        items_data = attrs.get("items", None)  # puede venir o no
        self._assert_ready_to_send(instance=instance, incoming=attrs, items_data=items_data)
        return attrs

    def create(self, validated_data):
        validated_data.pop("user", None)
        items_data = validated_data.pop("items", [])
        user = self._require_user()

        # Candado de envío si en create ya intentan status='sent'
        self._assert_ready_to_send(instance=None, incoming=validated_data, items_data=items_data)

        try:
            with transaction.atomic():
                requisition = Requisition.objects.create(user=user, **validated_data)
                for item_data in items_data:
                    RequisitionItem.objects.create(requisition=requisition, **item_data)
                return requisition
        except (IntegrityError, DjangoValidationError, ObjectDoesNotExist, TypeError, KeyError) as e:
            raise ValidationError({"detail": str(e)})

    def update(self, instance, validated_data):
        validated_data.pop("user", None)
        items_data = validated_data.pop("items", None)

        # Candado de envío si en update intentan status='sent'
        self._assert_ready_to_send(instance=instance, incoming=validated_data, items_data=items_data)

        try:
            with transaction.atomic():
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()

                if items_data is not None:
                    existing = {it.id: it for it in instance.items.all()}
                    sent_ids = []

                    for row in items_data:
                        iid = row.get("id")

                        if iid and iid in existing:
                            it = existing[iid]
                            for a, v in row.items():
                                if a != "id":
                                    setattr(it, a, v)
                            it.save()
                            sent_ids.append(iid)
                        else:
                            RequisitionItem.objects.create(requisition=instance, **row)

                    # borra los que no vinieron
                    for iid, it in existing.items():
                        if iid not in sent_ids:
                            it.delete()

                return instance
        except (IntegrityError, DjangoValidationError, ObjectDoesNotExist, TypeError, KeyError) as e:
            raise ValidationError({"detail": str(e)})
