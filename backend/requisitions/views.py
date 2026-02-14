# backend/requisitions/views.py

from decimal import Decimal, InvalidOperation
from io import BytesIO
import json
import re

from rest_framework import viewsets, permissions, status, filters
from rest_framework.parsers import MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse

from django.db.models import Count  # ✅ contar items
from django.shortcuts import get_object_or_404  # ✅ NUEVO

from .models import (
    Requisition, RequisitionItem, RequisitionRealAmountLog,
    RequisitionQuote, RequisitionQuoteItem,
)
from .serializers import (
    RequisitionSerializer, RequisitionItemSerializer,
    RequisitionQuoteSerializer,
)
from .pdf_generator import generate_requisition_pdf

import traceback


def _merge_pdf_bytes(main_pdf_bytes: bytes, extra_pdf_paths: list[str]) -> bytes:
    """
    Une el PDF principal + PDFs extra (cotizaciones) en un solo PDF final.
    Requiere pypdf (recomendado) o PyPDF2.
    """
    try:
        from pypdf import PdfReader, PdfWriter
    except Exception:  # pragma: no cover
        try:
            from PyPDF2 import PdfReader, PdfWriter
        except Exception as e:
            raise RuntimeError(
                "Falta dependencia para unir PDFs. Instala: pip install pypdf"
            ) from e

    writer = PdfWriter()

    # 1) principal
    main_reader = PdfReader(BytesIO(main_pdf_bytes))
    for page in main_reader.pages:
        writer.add_page(page)

    # 2) anexos (cotizaciones)
    failures = []
    for path in extra_pdf_paths:
        try:
            with open(path, "rb") as f:
                r = PdfReader(f)
                for page in r.pages:
                    writer.add_page(page)
        except Exception as e:
            failures.append(f"{path}: {e}")

    if failures:
        raise ValueError("No se pudieron leer algunas cotizaciones:\n" + "\n".join(failures))

    out = BytesIO()
    writer.write(out)
    return out.getvalue()


# =============================================================================
# ✅ NUEVO: Parsing tolerante de item_ids
# =============================================================================

def _explode_ids_string(s: str) -> list[str]:
    """
    Convierte un string a tokens de IDs:
      - "69,70" -> ["69","70"]
      - "69 70" -> ["69","70"]
      - "[69,70]" -> ["69","70"] (vía json)
      - '["69","70"]' -> ["69","70"] (vía json)
    """
    s = (s or "").strip()
    if not s:
        return []

    # Intentar JSON primero si parece lista/valor JSON
    if (s.startswith("[") and s.endswith("]")) or (s.startswith('"[') and s.endswith(']"')):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                out = []
                for v in parsed:
                    if v is None:
                        continue
                    out.extend(_explode_ids_string(str(v)))
                return out
            if isinstance(parsed, (int, float, str)):
                return _explode_ids_string(str(parsed))
        except Exception:
            # si falla JSON, caemos a split por separadores
            pass

    # Split por comas/espacios
    parts = re.split(r"[\s,]+", s)
    return [p for p in (x.strip() for x in parts) if p]


def _parse_item_ids_tolerant(raw_ids) -> list[int]:
    """
    Acepta:
      - ["69","70"] (ideal)
      - ["69,70"] (bug común)
      - "69,70"
      - "[69,70]" / '["69","70"]'
      - 69
    Retorna lista de ints únicos (preserva orden).
    """
    tokens: list[str] = []

    if raw_ids is None:
        tokens = []
    elif isinstance(raw_ids, (list, tuple)):
        # puede llegar ["69","70"] o ["69,70"] o mezcla
        for v in raw_ids:
            if v is None:
                continue
            tokens.extend(_explode_ids_string(str(v)))
    else:
        tokens = _explode_ids_string(str(raw_ids))

    # Convertir a int + validar
    out: list[int] = []
    seen = set()

    for t in tokens:
        t = str(t).strip()
        if not t:
            continue
        if not re.fullmatch(r"\d+", t):
            raise ValueError(f"token inválido: {t}")
        n = int(t)
        if n <= 0:
            raise ValueError(f"id inválido: {t}")
        if n not in seen:
            seen.add(n)
            out.append(n)

    return out


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


class IsAdminLike(permissions.BasePermission):
    """
    Admin “real” para este proyecto:
    - superuser
    - staff
    - role admin/superuser (si tu User tiene role)
    """
    def has_permission(self, request, view):
        user = getattr(request, "user", None)
        if not user or not getattr(user, "is_authenticated", False):
            return False
        return bool(
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or getattr(user, "role", "") in ("admin", "superuser")
        )


class RequisitionViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter, filters.SearchFilter]

    filterset_fields = ['status', 'requesting_department', 'project', 'created_at']
    ordering_fields = ['id', 'created_at', 'status']
    search_fields = ['requisition_reason']

    def get_queryset(self):
        user = self.request.user

        qs = (
            Requisition.objects.all()
            .prefetch_related(
                "items__description",
                "items__product",
                "items__unit",
            )
            .annotate(item_count=Count("items", distinct=True))
        )

        is_admin_like = bool(
            getattr(user, "is_superuser", False)
            or getattr(user, "is_staff", False)
            or getattr(user, "role", "") in ("admin", "superuser")
        )

        if not is_admin_like:
            qs = qs.filter(user=user)

        # ✅ ocultar requisiciones sin items SOLO en list
        if getattr(self, "action", None) == "list":
            qs = qs.filter(item_count__gt=0)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # =========================================================================
    # ✅ NUEVO: Items anidados (GET/POST/PATCH/DELETE)
    #   POST   /api/requisitions/{id}/items/               -> crea 1 item y regresa el item con id
    #   GET    /api/requisitions/{id}/items/               -> lista items de la requisición
    #   PATCH  /api/requisitions/{id}/items/{item_id}/     -> edita 1 item
    #   DELETE /api/requisitions/{id}/items/{item_id}/     -> borra 1 item
    # =========================================================================

    @action(
        detail=True,
        methods=["get", "post"],
        permission_classes=[permissions.IsAuthenticated],
        url_path="items"
    )
    def items_nested(self, request, pk=None):
        requisition = self.get_object()

        if requisition.status == "cancelled":
            return Response(
                {"detail": "No se puede modificar una requisición cancelada."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if request.method == "GET":
            qs = requisition.items.order_by("id")
            ser = RequisitionItemSerializer(qs, many=True)
            return Response(ser.data, status=status.HTTP_200_OK)

        # POST: crear 1 item
        ser = RequisitionItemSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)

        # Fuerza requisition del parent (evita colisiones)
        item = ser.save(requisition=requisition)

        out = RequisitionItemSerializer(item).data
        return Response(out, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["patch", "delete"],
        permission_classes=[permissions.IsAuthenticated],
        url_path=r"items/(?P<item_id>\d+)"
    )
    def item_nested(self, request, pk=None, item_id=None):
        requisition = self.get_object()

        if requisition.status == "cancelled":
            return Response(
                {"detail": "No se puede modificar una requisición cancelada."},
                status=status.HTTP_400_BAD_REQUEST
            )

        item = get_object_or_404(requisition.items, id=item_id)

        if request.method == "DELETE":
            # No permitir borrar si ya está cotizado
            if RequisitionQuoteItem.objects.filter(requisition_item=item).exists():
                return Response(
                    {"detail": "No puedes eliminar una partida que ya tiene cotización. Elimina la cotización primero."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # PATCH
        ser = RequisitionItemSerializer(item, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save(requisition=requisition)

        return Response(ser.data, status=status.HTTP_200_OK)

    # =========================================================================

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def export_pdf(self, request, pk=None):
        requisition = self.get_object()

        # ✅ Candados antes de imprimir/exportar
        if requisition.status == "cancelled":
            return Response(
                {"detail": "No se puede imprimir una requisición cancelada."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not requisition.ack_cost_realistic:
            return Response(
                {"detail": "Debes confirmar 'costo aproximado pero realista' antes de imprimir/exportar."},
                status=status.HTTP_400_BAD_REQUEST
            )

        items = requisition.items.all()
        if not items.exists():
            return Response(
                {"detail": "No se puede imprimir/exportar una requisición sin renglones (items)."},
                status=status.HTTP_400_BAD_REQUEST
            )

        bad = []
        for it in items:
            if it.estimated_total is None or it.estimated_total <= 0:
                bad.append(it.id)

        if bad:
            return Response(
                {"detail": f"No se puede imprimir/exportar: hay renglones sin monto válido (estimated_total). Item IDs: {bad}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            buf = generate_requisition_pdf(requisition)

            # ✅ anexar cotizaciones (PDFs) al final
            quote_paths = []
            for q in requisition.quotes.order_by("uploaded_at"):
                try:
                    if q.file and hasattr(q.file, "path"):
                        quote_paths.append(q.file.path)
                except Exception:
                    pass

            pdf_bytes = buf.getvalue()
            if quote_paths:
                pdf_bytes = _merge_pdf_bytes(pdf_bytes, quote_paths)

            resp = HttpResponse(pdf_bytes, content_type='application/pdf')
            resp['Content-Disposition'] = f'inline; filename="requisicion_{requisition.id}.pdf"'
            return resp

        except Exception as e:
            traceback.print_exc()
            return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminLike])
    def set_real_amount(self, request, pk=None):
        """
        ✅ Admin-only
        Captura/actualiza monto real TOTAL de requisición y deja auditoría (quién/cuándo/por qué).
        """
        requisition = self.get_object()

        if not requisition.items.exists():
            return Response(
                {"detail": "No puedes capturar monto real si la requisición no tiene partidas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not requisition.ack_cost_realistic:
            return Response(
                {"detail": "Debes verificar el costo aproximado pero realista antes de capturar el monto real."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_amount = request.data.get("real_amount", None)
        reason = (request.data.get("reason") or "").strip()

        if raw_amount is None or str(raw_amount).strip() == "":
            return Response({"real_amount": "Este campo es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        if not reason:
            return Response({"reason": "Este campo es requerido (motivo del cambio)."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_value = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return Response({"real_amount": "Formato inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if new_value <= Decimal("0.00"):
            return Response({"real_amount": "Debe ser mayor a 0."}, status=status.HTTP_400_BAD_REQUEST)

        old_value = requisition.real_amount

        if old_value == new_value:
            return Response({"detail": "Sin cambios."}, status=status.HTTP_200_OK)

        requisition.real_amount = new_value
        requisition.save(update_fields=["real_amount"])

        RequisitionRealAmountLog.objects.create(
            requisition=requisition,
            old_value=old_value,
            new_value=new_value,
            reason=reason,
            changed_by=request.user,
        )

        return Response(
            {"real_amount": str(requisition.real_amount)},
            status=status.HTTP_200_OK
        )

    # =========================================================================
    # ✅ Cotizaciones (GET/POST/DELETE)
    # =========================================================================

    @action(
        detail=True,
        methods=["get", "post"],
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser],
        url_path="quotes"
    )
    def quotes(self, request, pk=None):
        requisition = self.get_object()

        if request.method == "GET":
            qs = requisition.quotes.order_by("-uploaded_at")
            ser = RequisitionQuoteSerializer(qs, many=True)
            return Response(ser.data, status=status.HTTP_200_OK)

        # POST upload
        if not requisition.items.exists():
            return Response(
                {"detail": "No puedes subir cotizaciones si la requisición no tiene partidas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_obj = request.FILES.get("file")
        if not file_obj:
            return Response({"file": "Este campo es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        name = (getattr(file_obj, "name", "") or "").lower()
        if not name.endswith(".pdf"):
            return Response({"file": "Solo se permiten archivos .pdf"}, status=status.HTTP_400_BAD_REQUEST)

        # header %PDF
        try:
            head = file_obj.read(4)
            file_obj.seek(0)
            if head != b"%PDF":
                return Response({"file": "El archivo no parece ser un PDF válido."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            pass

        if getattr(file_obj, "size", 0) > 50 * 1024 * 1024:
            return Response({"file": "El archivo excede 50 MB."}, status=status.HTTP_400_BAD_REQUEST)

        # ---------------------------------------------------------------------
        # ✅ Parche tolerante para item_ids
        # ---------------------------------------------------------------------
        if hasattr(request.data, "getlist"):
            raw_ids = request.data.getlist("item_ids") or request.data.getlist("item_ids[]")
            if not raw_ids:
                # fallback por si viene como un solo string
                raw_ids = request.data.get("item_ids") or request.data.get("item_ids[]") or []
        else:
            raw_ids = request.data.get("item_ids") or request.data.get("item_ids[]") or []

        try:
            item_ids = _parse_item_ids_tolerant(raw_ids)
        except Exception:
            return Response({"item_ids": "IDs inválidos."}, status=status.HTTP_400_BAD_REQUEST)

        if not item_ids:
            return Response({"item_ids": "Debes seleccionar al menos una partida."}, status=status.HTTP_400_BAD_REQUEST)

        items_qs = requisition.items.filter(id__in=item_ids)
        if items_qs.count() != len(set(item_ids)):
            return Response({"item_ids": "Algunos items no pertenecen a esta requisición."}, status=status.HTTP_400_BAD_REQUEST)

        already = RequisitionQuoteItem.objects.filter(
            requisition_item_id__in=item_ids
        ).values_list("requisition_item_id", flat=True)
        already = list(already)
        if already:
            return Response(
                {"item_ids": f"Algunos items ya tienen cotización asignada. Item IDs: {already}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        quote = RequisitionQuote.objects.create(
            requisition=requisition,
            file=file_obj,
            original_name=getattr(file_obj, "name", "") or "",
            size_bytes=getattr(file_obj, "size", 0) or 0,
            uploaded_by=request.user
        )

        for it in items_qs:
            RequisitionQuoteItem.objects.create(quote=quote, requisition_item=it)

        ser = RequisitionQuoteSerializer(quote)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["delete"],
        permission_classes=[permissions.IsAuthenticated],
        url_path=r"quotes/(?P<quote_id>\d+)"
    )
    def delete_quote(self, request, pk=None, quote_id=None):
        requisition = self.get_object()
        try:
            quote = requisition.quotes.get(id=quote_id)
        except RequisitionQuote.DoesNotExist:
            return Response({"detail": "Cotización no encontrada."}, status=status.HTTP_404_NOT_FOUND)

        try:
            if quote.file:
                quote.file.delete(save=False)
        except Exception:
            pass

        quote.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class RequisitionItemViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        user = self.request.user

        qs = RequisitionItem.objects.select_related(
            "requisition",
            "description",
            "product",
            "unit",
        )

        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False) \
           or getattr(user, "role", "") in ("admin", "superuser"):
            return qs
        return qs.filter(requisition__user=user)
