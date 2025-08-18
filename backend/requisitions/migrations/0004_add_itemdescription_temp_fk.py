from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):

    dependencies = [
        ('requisitions', '0003_remove_product_expense_object_and_more'),  # <-- put your real previous migration here
    ]

    operations = [
        migrations.CreateModel(
            name='ItemDescription',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=255, unique=True)),
            ],
        ),
        migrations.AddField(
            model_name='requisitionitem',
            name='description_new',
            field=models.ForeignKey(
                to='requisitions.ItemDescription',
                null=True, blank=True,
                on_delete=django.db.models.deletion.PROTECT
            ),
        ),
    ]
