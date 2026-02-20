"""
Script untuk refactoring charge job section di _attendance_logic.json
Mengganti parseChargeJob + PART 1-5 dengan include ke _charge_job_full.json
"""

import json
import sys
from pathlib import Path

# Fix Windows encoding
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    import io
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

template_path = Path(__file__).parent / 'templates' / '_attendance_logic.json'
backup_path = Path(__file__).parent / 'templates' / '_attendance_logic.json.backup'
output_path = Path(__file__).parent / 'templates' / '_attendance_logic_v3.json'

print('=' * 60)
print('  REFACTOR CHARGE JOB SECTION')
print('=' * 60)
print()

# Read template
with open(template_path, 'r', encoding='utf-8') as f:
    content = f.read()
    template = json.loads(content)

def find_all_parse_charge_job(obj, path=""):
    """Find all parseChargeJob actions in the JSON structure"""
    results = []

    if isinstance(obj, dict):
        if obj.get('action') == 'parseChargeJob':
            results.append((path, obj))
        for key, value in obj.items():
            results.extend(find_all_parse_charge_job(value, f"{path}.{key}" if path else key))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            results.extend(find_all_parse_charge_job(item, f"{path}[{i}]"))

    return results

print("Searching for parseChargeJob actions...")
found = find_all_parse_charge_job(template)

print(f"\nFound {len(found)} parseChargeJob actions:")
for path, obj in found:
    print(f"  - {path}")

# Now let's replace them
def replace_charge_job_recursive(obj):
    """Recursively replace charge job sections"""
    if isinstance(obj, dict):
        # Check if this is a parseChargeJob action
        if obj.get('action') == 'parseChargeJob':
            print(f"\nFound parseChargeJob, replacing...")
            # Return the include action instead
            return {
                "action": "include",
                "params": {
                    "template": "_charge_job_full"
                },
                "comment": "═══ CHARGE JOB INPUT (extracted to _charge_job_full.json) ═══"
            }

        # Process all values in the dict
        return {k: replace_charge_job_recursive(v) for k, v in obj.items()}

    elif isinstance(obj, list):
        # Check if this list contains parseChargeJob
        new_list = []
        skip_until_marker = False

        for item in obj:
            if skip_until_marker:
                # Check if we should stop skipping
                if isinstance(item, dict):
                    action = item.get('action', '')
                    message = item.get('params', {}).get('message', '')
                    comment = item.get('comment', '')

                    # Stop skipping markers
                    if (action == 'log' and 'Skipping Hour Input' in message) or \
                       (action == 'log' and 'Skipping Enter key' in message) or \
                       (action == 'typeInput' and 'txtHours' in item.get('params', {}).get('selector', '')) or \
                       (action == 'if' and 'VALIDATION' in comment):
                        skip_until_marker = False
                        new_list.append(item)
                    else:
                        continue  # Skip this item
                else:
                    new_list.append(replace_charge_job_recursive(item))
            else:
                if isinstance(item, dict) and item.get('action') == 'parseChargeJob':
                    # Start skipping mode - replace with include
                    new_list.append({
                        "action": "include",
                        "params": {
                            "template": "_charge_job_full"
                        },
                        "comment": "═══ CHARGE JOB INPUT (extracted) ═══"
                    })
                    skip_until_marker = True
                else:
                    new_list.append(replace_charge_job_recursive(item))

        return new_list

    return obj

print("\nProcessing template...")
result = replace_charge_job_recursive(template)

print("\n[OK] Refactoring complete!")

# Create backup if not exists
if not backup_path.exists():
    import shutil
    shutil.copy(template_path, backup_path)
    print(f"[OK] Backup created: {backup_path.name}")

# Write output
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"[OK] Saved to: {output_path.name}")
print()
print('=' * 60)
print('  NEXT STEPS:')
print('  1. Check _attendance_logic_v3.json')
print('  2. Verify charge job sections are replaced')
print('  3. Test with the automation')
print('=' * 60)
