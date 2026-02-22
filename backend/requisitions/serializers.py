# sistema-adquisiciones/backend/requisitions/serializers.py

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction, IntegrityError
from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError

from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import (
    Requisition, RequisitionItem, RequisitionRealAmountLog,
    RequisitionQuote, RequisitionQuoteItem,
)


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

    # ✅ IMPORTANTE: el parent fija requisition, no el cliente
    requisition = serializers.PrimaryKeyRelatedField(read_only=True)

    # ✅ NUEVO: descripción manual (cuando no hay FK description)
    manual_description = serializers.CharField(
        required=False,
        allow_null=True,
        allow_blank=True,
    )

    # ✅ texto de descripción y display bonito (soporta FK o manual)
    description_text = serializers.SerializerMethodField(read_only=True)
    description_display = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = RequisitionItem
        fields = "__all__"
        read_only_fields = ["requisition", "description_text", "description_display"]

    def get_description_text(self, obj):
        try:
            if obj.description_id and getattr(obj, "description", None):
                return obj.description.text
        except Exception:
            pass
        return (getattr(obj, "manual_description", None) or "").strip()

    def get_description_display(self, obj):
        try:
            if obj.description_id and getattr(obj, "description", None):
                return f"{obj.description.text} (ID: {obj.description_id})"
        except Exception:
            pass
        md = (getattr(obj, "manual_description", None) or "").strip()
        return md or ""

    def validate(self, attrs):
        """
        Candado de 'monto por renglón' (estimated_total):
        - Si viene estimated_total: validar > 0.
        - Si NO viene:
            - En CREATE: intentar calcularlo desde:
                a) estimated_unit_cost (payload), o
                b) description.estimated_unit_cost (catálogo)
              y quantity.
            - En PATCH/UPDATE: si cambió quantity/description/estimated_unit_cost/manual_description,
              recalcular; si no cambió, conservar el total actual.
        Reglas nuevas:
        - OBLIGATORIO: (description) OR (manual_description + estimated_unit_cost).
        - Si hay description, manual_description se fuerza a None.
        """
        instance = getattr(self, "instance", None)

        incoming_total = "estimated_total" in attrs
        incoming_qty = "quantity" in attrs
        incoming_unit = "estimated_unit_cost" in attrs
        incoming_desc = "description" in attrs
        incoming_manual = "manual_description" in attrs

        qty = attrs.get("quantity", getattr(instance, "quantity", None) if instance else None)
        est_total = attrs.get("estimated_total", getattr(instance, "estimated_total", None) if instance else None)
        est_unit = attrs.get("estimated_unit_cost", getattr(instance, "estimated_unit_cost", None) if instance else None)
        desc = attrs.get("description", getattr(instance, "description", None) if instance else None)
        manual = attrs.get("manual_description", getattr(instance, "manual_description", None) if instance else None)

        # --- Normalizar unit/total si vienen explícitos ---
        if incoming_total and est_total is not None:
            est_total = _money2(est_total)
            attrs["estimated_total"] = est_total

        if incoming_unit and est_unit is not None:
            est_unit = _money2(est_unit)
            attrs["estimated_unit_cost"] = est_unit

        # --- Regla principal: o catálogo o manual ---
        if desc is None:
            # Si el cliente manda manual_description con texto pero NO manda description, y
            # el instance tiene description, exigimos que el cliente mande description=null explícito.
            if incoming_manual and (manual or "").strip() and instance and getattr(instance, "description_id", None) and not incoming_desc:
                raise ValidationError({
                    "description": "Para usar descripción manual debes enviar explícitamente description=null."
                })

            if not (manual or "").strip():
                raise ValidationError({
                    "manual_description": "La descripción manual es obligatoria cuando no hay descripción de catálogo."
                })
            if est_unit is None:
                raise ValidationError({
                    "estimated_unit_cost": "El costo unitario es obligatorio cuando la descripción es manual."
                })

            # asegurar que el modelo quede sin FK
            attrs["description"] = None

        else:
            # Si hay catálogo, evita mezclar ambas
            attrs["manual_description"] = None

        # --- Validaciones mínimas: evitar 0 o negativos ---
        # unitario (si existe) debe ser > 0
        if est_unit is not None and _money2(est_unit) <= Decimal("0.00"):
            raise ValidationError({"estimated_unit_cost": "Debe ser mayor a 0."})

        # total (si existe) debe ser > 0
        if incoming_total:
            if attrs.get("estimated_total") is None:
                raise ValidationError({"estimated_total": "Este campo no puede ser null."})
            if attrs["estimated_total"] <= Decimal("0.00"):
                raise ValidationError({"estimated_total": "Debe ser mayor a 0."})

        # --- Si estimated_total NO viene, decidir calcular o conservar ---
        need_recalc = (instance is None) or incoming_qty or incoming_unit or incoming_desc or incoming_manual

        if not incoming_total:
            if need_recalc:
                # 1) unit cost desde payload si viene o ya existe (manual exige est_unit)
                unit_cost = est_unit

                # 2) si no hay unitario y hay catálogo, tomar de catálogo
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
                    # Si no se puede calcular pero el instance ya tenía total válido, lo conservamos
                    if instance is not None and getattr(instance, "estimated_total", None) is not None and not (incoming_qty or incoming_unit or incoming_desc or incoming_manual):
                        attrs["estimated_total"] = _money2(getattr(instance, "estimated_total"))
                    else:
                        raise ValidationError({
                            "estimated_total": (
                                "Este campo es obligatorio por renglón. "
                                "Puedes enviarlo directamente o permitir que se calcule "
                                "desde estimated_unit_cost o desde el costo del catálogo (ItemDescription.estimated_unit_cost)."
                            )
                        })
            else:
                # no cambios relevantes, conservar
                if est_total is not None:
                    attrs["estimated_total"] = _money2(est_total)

        # --- Validación final de total ---
        if attrs.get("estimated_total") is not None and attrs["estimated_total"] <= Decimal("0.00"):
            raise ValidationError({"estimated_total": "Debe ser mayor a 0."})

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

    # ✅ Solo lectura aquí: para mantener auditoría obligatoria
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

        if target_status != "sent":
            return

        if "ack_cost_realistic" in incoming:
            ack = bool(incoming.get("ack_cost_realistic"))
        else:
            ack = bool(getattr(instance, "ack_cost_realistic", False)) if instance else False

        if not ack:
            raise ValidationError({
                "ack_cost_realistic": "Debes confirmar 'costo aproximado pero realista' para poder ENVIAR."
            })

        if items_data is not None:
            items = items_data
        else:
            items = list(instance.items.all().values("estimated_total")) if instance else []

        if not items or len(items) == 0:
            raise ValidationError({"items": "No se puede ENVIAR una requisición sin renglones (items)."})

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
        # ✅ HARDENING: No permitir CREATE (POST) sin items
        if self.instance is None:
            items = attrs.get("items", None)
            if not items or len(items) == 0:
                raise ValidationError({"items": "Debes registrar al menos una partida."})

        # ✅ Bloqueo duro: real_amount NO se edita por este serializer
        req = self.context.get("request")
        data = getattr(req, "data", {}) if req is not None else {}
        if isinstance(data, dict) and "real_amount" in data:
            raise ValidationError({
                "real_amount": (
                    "El monto real NO se edita por este endpoint. "
                    "Usa POST /api/requisitions/{id}/set_real_amount/ (con reason) para dejar auditoría."
                )
            })

        instance = getattr(self, "instance", None)
        items_data = attrs.get("items", None)
        self._assert_ready_to_send(instance=instance, incoming=attrs, items_data=items_data)
        return attrs

    def create(self, validated_data):
        validated_data.pop("user", None)
        items_data = validated_data.pop("items", None)
        user = self._require_user()

        if not items_data or len(items_data) == 0:
            raise ValidationError({"items": "Debes registrar al menos una partida."})

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

        self._assert_ready_to_send(instance=instance, incoming=validated_data, items_data=items_data)

        try:
            with transaction.atomic():
                for attr, value in validated_data.items():
                    setattr(instance, attr, value)
                instance.save()

                # 👇 OJO: con Opción B, idealmente ya NO mandas items en PUT.
                # Si items_data llega, este bloque seguirá sincronizando (y puede borrar si faltan).
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

                    for iid, it in existing.items():
                        if iid not in sent_ids:
                            it.delete()

                return instance
        except (IntegrityError, DjangoValidationError, ObjectDoesNotExist, TypeError, KeyError) as e:
            raise ValidationError({"detail": str(e)})


class RequisitionQuoteSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    item_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=True
    )
    items = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = RequisitionQuote
        fields = [
            "id",
            "requisition",
            "file_url",
            "original_name",
            "size_bytes",
            "uploaded_by",
            "uploaded_at",
            "item_ids",
            "items",
        ]
        read_only_fields = ["id", "uploaded_by", "uploaded_at", "file_url", "size_bytes", "original_name"]

    def get_file_url(self, obj):
        try:
            return obj.file.url if obj.file else None
        except Exception:
            return None

    def get_items(self, obj):
        qs = obj.items.all().values("id", "product_id", "description_id", "quantity", "estimated_total")
        return list(qs)

    def validate_item_ids(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError("Debes seleccionar al menos una partida.")
        return value

    def create(self, validated_data):
        item_ids = validated_data.pop("item_ids", [])
        req = validated_data.get("requisition")

        items = RequisitionItem.objects.filter(id__in=item_ids, requisition=req)
        if items.count() != len(set(item_ids)):
            raise serializers.ValidationError({"item_ids": "Algunos items no pertenecen a esta requisición."})

        already = RequisitionQuoteItem.objects.filter(
            requisition_item__in=items
        ).values_list("requisition_item_id", flat=True)
        already = list(already)
        if already:
            raise serializers.ValidationError({"item_ids": f"Estos items ya tienen cotización. Item IDs: {already}"})

        request = self.context.get("request")
        if request and getattr(request, "user", None):
            validated_data.setdefault("uploaded_by", request.user)

        quote = RequisitionQuote.objects.create(**validated_data)

        if quote.file:
            quote.original_name = getattr(quote.file, "name", "") or quote.original_name
            quote.size_bytes = getattr(quote.file, "size", 0) or 0
            quote.save(update_fields=["original_name", "size_bytes"])

        for it in items:
            RequisitionQuoteItem.objects.create(quote=quote, requisition_item=it)

        return quote