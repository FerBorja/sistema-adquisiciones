from django.db import migrations

def forwards(apps, schema_editor):
    RequisitionItem = apps.get_model('requisitions', 'RequisitionItem')
    ItemDescription = apps.get_model('requisitions', 'ItemDescription')

    # If the old text field doesn't exist anymore, just skip safely.
    fields = {f.name for f in RequisitionItem._meta.get_fields()}
    has_old_text = 'description' in fields  # old TextField

    for item in RequisitionItem.objects.all():
        text = ''
        if has_old_text:
            text = (getattr(item, 'description', '') or '').strip()
        if not text:
            desc_obj, _ = ItemDescription.objects.get_or_create(text='(Sin descripción)')
        else:
            desc_obj, _ = ItemDescription.objects.get_or_create(text=text)
        RequisitionItem.objects.filter(pk=item.pk).update(description_new_id=desc_obj.id)

def backwards(apps, schema_editor):
    # No reverse (would need to decide how to write text back)
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('requisitions', '0004_add_itemdescription_temp_fk'),  # adjust if numbering changed
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
