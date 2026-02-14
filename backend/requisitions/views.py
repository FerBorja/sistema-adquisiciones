# sistema-adquisiciones/backend/requisitions/views.py
from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, permissions, status, filters
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.pagination import PageNumberPagination
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse

from .models import Requisition, RequisitionItem, RequisitionRealAmountLog
from .serializers import RequisitionSerializer, RequisitionItemSerializer
from .pdf_generator import generate_requisition_pdf

import traceback


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

        # ✅ Prefetch para requisición + items anidados (evita N+1 al serializar)
        qs = (
            Requisition.objects.all()
            .prefetch_related(
                "items__description",
                "items__product",
                "items__unit",
            )
        )

        # Any of these flags/roles should grant full visibility
        if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False) \
           or getattr(user, "role", "") in ("admin", "superuser"):
            return qs
        return qs.filter(user=user)

    def perform_create(self, serializer):
        # Ensure the authenticated user is set server-side
        serializer.save(user=self.request.user)

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
            resp = HttpResponse(buf.getvalue(), content_type='application/pdf')
            # Open inline in the browser tab with a friendly filename
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

        # ✅ NUEVO: Candado imposible por API
        # No permitir capturar monto real si la requisición no tiene partidas
        if not requisition.items.exists():
            return Response(
                {"detail": "No puedes capturar monto real si la requisición no tiene partidas."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ✅ NUEVO: Candado imposible por API
        # No permitir capturar monto real si NO confirmó costo aproximado realista
        if not requisition.ack_cost_realistic:
            return Response(
                {"detail": "Debes verificar el costo aproximado pero realista antes de capturar el monto real."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_amount = request.data.get("real_amount", None)
        reason = (request.data.get("reason") or "").strip()

        if raw_amount is None or str(raw_amount).strip() == "":
            return Response({"real_amount": "Este campo es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        # ✅ Hacemos reason obligatorio para aceptación (por qué)
        if not reason:
            return Response({"reason": "Este campo es requerido (motivo del cambio)."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_value = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
        except (InvalidOperation, ValueError):
            return Response({"real_amount": "Formato inválido."}, status=status.HTTP_400_BAD_REQUEST)

        if new_value <= Decimal("0.00"):
            return Response({"real_amount": "Debe ser mayor a 0."}, status=status.HTTP_400_BAD_REQUEST)

        old_value = requisition.real_amount

        # Si no cambió, no logueamos
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


class RequisitionItemViewSet(viewsets.ModelViewSet):
    serializer_class = RequisitionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        user = self.request.user

        # ✅ select_related para evitar N+1 al serializar description_text/display
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
