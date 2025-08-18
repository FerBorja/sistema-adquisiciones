from django.db import migrations, models
import django.db.models.deletion
from django.db.models.functions import Lower

class Migration(migrations.Migration):

    dependencies = [
        ('requisitions', '0007_alter_itemdescription_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='itemdescription',
            name='product',
            field=models.ForeignKey(
                to='requisitions.product',
                on_delete=django.db.models.deletion.CASCADE,
                related_name='descriptions',
                null=True,
                blank=True,
            ),
        ),
        migrations.AddConstraint(
            model_name='itemdescription',
            constraint=models.UniqueConstraint(
                Lower('text'), 'product', name='uniq_itemdesc_product_text_ci'
            ),
        ),
    ]
