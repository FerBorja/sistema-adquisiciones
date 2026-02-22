# backend/requisitions/views.py

from decimal import Decimal, InvalidOperation
from io import BytesIO
import json
import re
from datetime import timedelta
import unicodedata

from rest_framework import viewsets, permissions, status, filters
from rest_framework.parsers import MultiPartParser, FormParser
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse

from django.db.models import Count, Prefetch  # ✅ contar items + prefetch
from django.shortcuts import get_object_or_404  # ✅ NUEVO
from django.utils import timezone

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


# =============================================================================
# ✅ Duplicados: configuración
# =============================================================================
DUPLICATE_WINDOW_DAYS_DEFAULT = 30
DUPLICATE_MAX_RESULTS = 10
DUPLICATE_MIN_MATCH_RATIO = 0.5  # tu criterio aceptado ✅

# ✅ Ahora también corre en "registered" (guardar/crear), no solo en "sent"
DUPLICATE_GUARD_TARGET_STATUSES = {"sent", "registered"}


def _is_admin_like_user(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    role = getattr(user, "role", "") or ""
    role = str(role).lower()
    return bool(
        getattr(user, "is_superuser", False)
        or getattr(user, "is_staff", False)
        or role in ("admin", "superuser")
    )


def _should_force_duplicates(request) -> bool:
    v = request.query_params.get("force_duplicates")
    if v is None:
        v = request.headers.get("X-Force-Duplicates")
    return str(v).lower() in ("1", "true", "yes", "y")


def _norm_text(s: str) -> str:
    if not s:
        return ""
    s = str(s).strip().lower()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\s]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _extract_pk(value):
    """Acepta int, str-int, o instancia modelo (FK)."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    return getattr(value, "pk", None)


HEADER_ID_FIELDS = [
    "requesting_department_id",
    "project_id",
    "funding_source_id",
    "budget_unit_id",
    "agreement_id",
    "tender_id",
    "external_service_id",
]


def _get_header_ids_from_instance_and_vd(instance: Requisition, vd: dict) -> dict:
    """
    Calcula los IDs finales del header que quedarán guardados (vd si viene, si no instance).
    """
    out = {}
    for field_id in HEADER_ID_FIELDS:
        field = field_id.replace("_id", "")
        if field in vd:
            out[field_id] = _extract_pk(vd.get(field))
        else:
            out[field_id] = getattr(instance, field_id, None)
    return out


def _get_header_ids_from_vd_only(vd: dict) -> dict:
    out = {}
    for field_id in HEADER_ID_FIELDS:
        field = field_id.replace("_id", "")
        out[field_id] = _extract_pk(vd.get(field))
    return out


def _item_signature(item: RequisitionItem) -> str:
    """
    Firma del “artículo” para duplicados:
      - product_id + description_id (catálogo)
      - si NO hay description_id: product_id + manual_description (normalizado)
      - fallback a texto si existiera description_text / description_display
    """
    pid = getattr(item, "product_id", None)
    did = getattr(item, "description_id", None)

    md_raw = getattr(item, "manual_description", "") or ""
    md_norm = _norm_text(md_raw)

    if pid and did:
        return f"p:{pid}|d:{did}"

    if pid and md_norm:
        return f"p:{pid}|m:{md_norm}"

    if pid:
        return f"p:{pid}"

    desc_txt = md_raw or getattr(item, "description_text", "") or getattr(item, "description_display", "")
    desc_norm = _norm_text(desc_txt)
    return f"t:{desc_norm}" if desc_norm else "unknown"


def _build_item_sig_set(items_qs) -> set:
    return {_item_signature(it) for it in items_qs}


def _filter_qs_by_header_ids(qs, header_ids: dict):
    """
    Aplica filtros exactos de header:
    si el valor es None => exige isnull
    si tiene valor => exige igualdad
    """
    for fid in HEADER_ID_FIELDS:
        field = fid.replace("_id", "")
        v = header_ids.get(fid, None)
        if v is None:
            qs = qs.filter(**{f"{field}__isnull": True})
        else:
            qs = qs.filter(**{fid: v})
    return qs


def _find_header_only_duplicates(
    *,
    request,
    current_req_id,
    header_ids: dict,
    reason_norm: str,
    window_days: int,
):
    """
    Duplicado header-only: mismo header + mismo motivo (normalizado).
    Útil en CREATE cuando aún no hay items.
    """
    now = timezone.now()
    start = now - timedelta(days=window_days)

    qs = Requisition.objects.all()
    qs = qs.filter(created_at__gte=start).exclude(status="cancelled")

    if current_req_id:
        qs = qs.exclude(pk=current_req_id)

    if not _is_admin_like_user(getattr(request, "user", None)):
        qs = qs.filter(user=request.user)

    qs = _filter_qs_by_header_ids(qs, header_ids)

    results = []
    for cand in qs.order_by("-created_at")[:200]:
        cand_reason_norm = _norm_text(getattr(cand, "requisition_reason", "") or "")
        if cand_reason_norm != reason_norm:
            continue

        results.append(
            {
                "id": cand.pk,
                "status": getattr(cand, "status", None),
                "date": cand.created_at.isoformat() if getattr(cand, "created_at", None) else None,
                "match_count": 0,
                "match_ratio": 1.0,
                "matching_signatures": [],
            }
        )

    return results[:DUPLICATE_MAX_RESULTS]


def _find_possible_duplicates(
    *,
    request,
    current_req_id,
    header_ids: dict,
    item_sigs: set,
    reason_norm: str,
    window_days: int,
):
    """
    Detección de duplicados:
      - header EXACTO (mismos FKs del encabezado)
      - ventana de tiempo sobre created_at
      - motivo normalizado igual
      - intersección fuerte de firmas de items
    Seguridad:
      - si NO admin-like, solo busca dentro de requisiciones del mismo user
        (evita filtrar/leakear existencia de requisiciones ajenas).
    """
    if not item_sigs:
        return _find_header_only_duplicates(
            request=request,
            current_req_id=current_req_id,
            header_ids=header_ids,
            reason_norm=reason_norm,
            window_days=window_days,
        )

    now = timezone.now()
    start = now - timedelta(days=window_days)

    qs = Requisition.objects.all()
    qs = qs.filter(created_at__gte=start).exclude(status="cancelled")

    if current_req_id:
        qs = qs.exclude(pk=current_req_id)

    if not _is_admin_like_user(getattr(request, "user", None)):
        qs = qs.filter(user=request.user)

    qs = _filter_qs_by_header_ids(qs, header_ids)

    qs = qs.prefetch_related(
        Prefetch(
            "items",
            queryset=RequisitionItem.objects.only(
                "id",
                "requisition_id",
                "product_id",
                "description_id",
                "manual_description",
            ),
        )
    )

    results = []
    for cand in qs.order_by("-created_at")[:200]:
        cand_reason_norm = _norm_text(getattr(cand, "requisition_reason", "") or "")
        if cand_reason_norm != reason_norm:
            continue

        cand_sigs = _build_item_sig_set(cand.items.all())
        if not cand_sigs:
            continue

        intersection = item_sigs.intersection(cand_sigs)
        if not intersection:
            continue

        match_count = len(intersection)
        match_ratio = match_count / max(len(item_sigs), 1)

        if match_ratio >= DUPLICATE_MIN_MATCH_RATIO or (len(item_sigs) == 1 and match_count == 1):
            results.append(
                {
                    "id": cand.pk,
                    "status": getattr(cand, "status", None),
                    "date": cand.created_at.isoformat() if getattr(cand, "created_at", None) else None,
                    "match_count": match_count,
                    "match_ratio": round(match_ratio, 3),
                    "matching_signatures": list(sorted(intersection))[:12],
                }
            )

    results.sort(key=lambda x: (x["match_ratio"], x["match_count"]), reverse=True)
    return results[:DUPLICATE_MAX_RESULTS]


def _should_run_duplicate_guard(*, instance: Requisition, validated_data: dict) -> bool:
    """
    ✅ NUEVA REGLA:
      - Si el status final es 'registered' => SIEMPRE corre (guardar/crear)
      - Si el status final es 'sent' => corre solo en transición (registered -> sent), para no fastidiar después
    """
    old_status = str(getattr(instance, "status", "") or "").strip().lower()
    new_status = str(validated_data.get("status", old_status) or "").strip().lower()

    if new_status == "registered":
        return True

    if new_status in DUPLICATE_GUARD_TARGET_STATUSES and old_status != new_status:
        return True

    return False


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

    main_reader = PdfReader(BytesIO(main_pdf_bytes))
    for page in main_reader.pages:
        writer.add_page(page)

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
    s = (s or "").strip()
    if not s:
        return []

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
            pass

    parts = re.split(r"[\s,]+", s)
    return [p for p in (x.strip() for x in parts) if p]


def _parse_item_ids_tolerant(raw_ids) -> list[int]:
    tokens: list[str] = []

    if raw_ids is None:
        tokens = []
    elif isinstance(raw_ids, (list, tuple)):
        for v in raw_ids:
            if v is None:
                continue
            tokens.extend(_explode_ids_string(str(v)))
    else:
        tokens = _explode_ids_string(str(raw_ids))

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
    def has_permission(self, request, view):
        return _is_admin_like_user(getattr(request, "user", None))


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

        is_admin_like = _is_admin_like_user(user)

        if not is_admin_like:
            qs = qs.filter(user=user)

        if getattr(self, "action", None) == "list":
            qs = qs.filter(item_count__gt=0)

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        vd = ser.validated_data

        status_in = vd.get("status", None)
        new_status = str(status_in or "registered").strip().lower()

        if new_status in DUPLICATE_GUARD_TARGET_STATUSES and not _should_force_duplicates(request):
            header_ids = _get_header_ids_from_vd_only(vd)
            reason_norm = _norm_text(vd.get("requisition_reason", "") or "")

            item_sigs = set()

            try:
                days = int(request.query_params.get("dup_days", DUPLICATE_WINDOW_DAYS_DEFAULT))
            except ValueError:
                days = DUPLICATE_WINDOW_DAYS_DEFAULT
            days = max(1, min(days, 365))

            duplicates = _find_possible_duplicates(
                request=request,
                current_req_id=None,
                header_ids=header_ids,
                item_sigs=item_sigs,
                reason_norm=reason_norm,
                window_days=days,
            )

            if duplicates:
                return Response(
                    {
                        "detail": "Posible requisición duplicada detectada.",
                        "window_days": days,
                        "criteria": {
                            **header_ids,
                            "items_count": 0,
                            "min_match_ratio": DUPLICATE_MIN_MATCH_RATIO,
                        },
                        "duplicates": duplicates,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        self.perform_create(ser)
        headers = self.get_success_headers(ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        ser = self.get_serializer(instance, data=request.data, partial=partial)
        ser.is_valid(raise_exception=True)
        vd = ser.validated_data

        should_guard = _should_run_duplicate_guard(instance=instance, validated_data=vd)

        if should_guard and not _should_force_duplicates(request):
            header_ids = _get_header_ids_from_instance_and_vd(instance, vd)
            reason_norm = _norm_text(vd.get("requisition_reason", getattr(instance, "requisition_reason", "") or "") or "")

            items_qs = RequisitionItem.objects.filter(requisition=instance).only(
                "id", "requisition_id", "product_id", "description_id", "manual_description"
            )
            item_sigs = _build_item_sig_set(items_qs)

            try:
                days = int(request.query_params.get("dup_days", DUPLICATE_WINDOW_DAYS_DEFAULT))
            except ValueError:
                days = DUPLICATE_WINDOW_DAYS_DEFAULT
            days = max(1, min(days, 365))

            duplicates = _find_possible_duplicates(
                request=request,
                current_req_id=instance.pk,
                header_ids=header_ids,
                item_sigs=item_sigs,
                reason_norm=reason_norm,
                window_days=days,
            )

            if duplicates:
                return Response(
                    {
                        "detail": "Posible requisición duplicada detectada.",
                        "window_days": days,
                        "criteria": {
                            **header_ids,
                            "items_count": len(item_sigs),
                            "min_match_ratio": DUPLICATE_MIN_MATCH_RATIO,
                        },
                        "duplicates": duplicates,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        self.perform_update(ser)
        return Response(ser.data)

    @action(detail=True, methods=["get"], url_path="check_duplicates")
    def check_duplicates(self, request, pk=None):
        instance = self.get_object()

        items_qs = RequisitionItem.objects.filter(requisition=instance).only(
            "id", "requisition_id", "product_id", "description_id", "manual_description"
        )
        item_sigs = _build_item_sig_set(items_qs)

        try:
            days = int(request.query_params.get("dup_days", DUPLICATE_WINDOW_DAYS_DEFAULT))
        except ValueError:
            days = DUPLICATE_WINDOW_DAYS_DEFAULT
        days = max(1, min(days, 365))

        header_ids = {fid: getattr(instance, fid, None) for fid in HEADER_ID_FIELDS}
        reason_norm = _norm_text(getattr(instance, "requisition_reason", "") or "")

        duplicates = _find_possible_duplicates(
            request=request,
            current_req_id=instance.pk,
            header_ids=header_ids,
            item_sigs=item_sigs,
            reason_norm=reason_norm,
            window_days=days,
        )

        return Response(
            {
                "has_duplicates": bool(duplicates),
                "window_days": days,
                "criteria": {
                    **header_ids,
                    "items_count": len(item_sigs),
                    "min_match_ratio": DUPLICATE_MIN_MATCH_RATIO,
                },
                "duplicates": duplicates,
            },
            status=status.HTTP_200_OK
        )

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

        ser = RequisitionItemSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)

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
            if RequisitionQuoteItem.objects.filter(requisition_item=item).exists():
                return Response(
                    {"detail": "No puedes eliminar una partida que ya tiene cotización. Elimina la cotización primero."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            item.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        ser = RequisitionItemSerializer(item, data=request.data, partial=True, context={"request": request})
        ser.is_valid(raise_exception=True)
        ser.save(requisition=requisition)

        return Response(ser.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def export_pdf(self, request, pk=None):
        requisition = self.get_object()

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

        try:
            head = file_obj.read(4)
            file_obj.seek(0)
            if head != b"%PDF":
                return Response({"file": "El archivo no parece ser un PDF válido."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            pass

        if getattr(file_obj, "size", 0) > 50 * 1024 * 1024:
            return Response({"file": "El archivo excede 50 MB."}, status=status.HTTP_400_BAD_REQUEST)

        if hasattr(request.data, "getlist"):
            raw_ids = request.data.getlist("item_ids") or request.data.getlist("item_ids[]")
            if not raw_ids:
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

        if _is_admin_like_user(user):
            return qs
        return qs.filter(requisition__user=user)