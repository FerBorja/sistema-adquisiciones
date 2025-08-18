from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):

    dependencies = [
        ('requisitions', '0005_copy_text_to_itemdescription'),  # adjust if numbering changed
    ]

    operations = [
        # Drop old text field if it still exists
        migrations.RemoveField(
            model_name='requisitionitem',
            name='description',
        ),
        # Rename the temp FK to final name
        migrations.RenameField(
            model_name='requisitionitem',
            old_name='description_new',
            new_name='description',
        ),
        # Make it required
        migrations.AlterField(
            model_name='requisitionitem',
            name='description',
            field=models.ForeignKey(
                to='requisitions.ItemDescription',
                on_delete=django.db.models.deletion.PROTECT
            ),
        ),
    ]
