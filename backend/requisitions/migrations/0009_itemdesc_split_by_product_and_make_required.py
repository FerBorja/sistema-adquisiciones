from django.db import migrations, models
import django.db.models.deletion

def forwards(apps, schema_editor):
    ItemDescription = apps.get_model('requisitions', 'ItemDescription')
    RequisitionItem = apps.get_model('requisitions', 'RequisitionItem')
    Product = apps.get_model('requisitions', 'Product')

    # Mapa (old_desc_id, product_id) -> new_desc_id para evitar duplicados
    cache = {}

    # Recorremos items y duplicamos/relacionamos descripciones por producto
    for item in RequisitionItem.objects.select_related('description', 'product').all():
        old_desc = item.description
        product = item.product
        if old_desc is None or product is None:
            continue

        key = (old_desc.id, product.id)
        if key in cache:
            new_desc_id = cache[key]
        else:
            exists = ItemDescription.objects.filter(
                product_id=product.id, text=old_desc.text
            ).first()
            if exists:
                new_desc_id = exists.id
            else:
                new_desc = ItemDescription.objects.create(
                    product_id=product.id,
                    text=old_desc.text,
                )
                new_desc_id = new_desc.id
            cache[key] = new_desc_id

        # Re-enlaza el item a la nueva descripción ligada al producto
        RequisitionItem.objects.filter(pk=item.pk).update(description_id=new_desc_id)

    # Limpia descripciones sin producto (ya no se usan)
    ItemDescription.objects.filter(product__isnull=True).delete()


def backwards(apps, schema_editor):
    # Sin reversión automática
    pass


class Migration(migrations.Migration):
    # IMPORTANT: make this migration non-atomic so DML and DDL don't conflict
    atomic = False

    dependencies = [
        ('requisitions', '0008_itemdesc_add_product_fk'),  # ajusta si tu numeración difiere
    ]

    operations = [
        # 0) Quitar unique=True en text (remueve el índice/constraint único antiguo)
        migrations.AlterField(
            model_name='itemdescription',
            name='text',
            field=models.CharField(max_length=255),
        ),

        # 1) Copiar datos a descripciones por producto y re-enlazar items
        migrations.RunPython(forwards, backwards),

        # 2) Hacer 'product' obligatorio ahora que los datos están en orden
        migrations.AlterField(
            model_name='itemdescription',
            name='product',
            field=models.ForeignKey(
                to='requisitions.product',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='descriptions',
            ),
        ),
    ]
