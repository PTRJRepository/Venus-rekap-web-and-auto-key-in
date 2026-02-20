"""
Script untuk refactoring leave sections di _attendance_logic_v3.json
Mengganti annual leave dan sick leave dengan include ke _leave_input_full.json
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

template_path = Path(__file__).parent / 'templates' / '_attendance_logic_v3.json'
output_path = Path(__file__).parent / 'templates' / '_attendance_logic_v4.json'

print('=' * 60)
print('  REFACTOR LEAVE SECTIONS')
print('=' * 60)
print()

# Read template
with open(template_path, 'r', encoding='utf-8') as f:
    content = f.read()
    template = json.loads(content)

def find_leave_sections(obj, path=""):
    """Find all annual leave and sick leave sections"""
    results = []

    if isinstance(obj, dict):
        comment = obj.get('comment', '')
        # Look for leave sections by comment
        if 'Process ANNUAL LEAVE' in comment:
            results.append(('annual', path, obj))
        elif 'Process SICK LEAVE' in comment:
            results.append(('sick', path, obj))

        for key, value in obj.items():
            results.extend(find_leave_sections(value, f"{path}.{key}" if path else key))
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            results.extend(find_leave_sections(item, f"{path}[{i}]"))

    return results

print("Searching for leave sections...")
found = find_leave_sections(template)

print(f"\nFound {len(found)} leave sections:")
for leave_type, path, obj in found:
    print(f"  - {leave_type.upper()} at {path}")

def replace_leave_sections(obj):
    """Recursively replace leave sections"""
    if isinstance(obj, dict):
        comment = obj.get('comment', '')

        # Check if this is the start of a leave section (the if with condition)
        if ('Process ANNUAL LEAVE' in comment or 'Process SICK LEAVE' in comment):
            leave_type = 'annual' if 'ANNUAL' in comment else 'sick'
            print(f"\nFound {leave_type.upper()} LEAVE section, replacing with include...")

            # Return include action instead
            return {
                "action": "include",
                "params": {
                    "template": "_leave_input_full",
                    "params": {
                        "leaveType": leave_type
                    }
                },
                "comment": f"═══ {leave_type.upper()} LEAVE INPUT (extracted to _leave_input_full.json) ═══"
            }

        # Process all values in the dict
        return {k: replace_leave_sections(v) for k, v in obj.items()}

    elif isinstance(obj, list):
        new_list = []
        skip_mode = False
        skip_depth = 0

        for item in obj:
            if skip_mode:
                # Count nested depth to skip entire leave section
                if isinstance(item, dict):
                    if 'thenSteps' in item:
                        skip_depth += 1
                    if skip_depth == 0:
                        # End of skip mode
                        skip_mode = False
                        new_list.append(replace_leave_sections(item))
                        continue
                elif isinstance(item, list):
                    if skip_depth > 0:
                        skip_depth -= 1

                if skip_mode:
                    continue

            if isinstance(item, dict):
                comment = item.get('comment', '')
                # Check for leave section start
                if 'Process ANNUAL LEAVE' in comment or 'Process SICK LEAVE' in comment:
                    leave_type = 'annual' if 'ANNUAL' in comment else 'sick'
                    print(f"Found {leave_type.upper()} LEAVE section, replacing with include...")

                    # Add include and start skipping
                    new_list.append({
                        "action": "include",
                        "params": {
                            "template": "_leave_input_full",
                            "params": {
                                "leaveType": leave_type
                            }
                        },
                        "comment": f"═══ {leave_type.upper()} LEAVE INPUT (extracted) ═══"
                    })
                    skip_mode = True
                    skip_depth = 0
                    continue

            new_list.append(replace_leave_sections(item))

        return new_list

    return obj

print("\nProcessing template...")
result = replace_leave_sections(template)

print("\n[OK] Refactoring complete!")

# Write output
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"[OK] Saved to: {output_path.name}")
print()
print('=' * 60)
print('  NEXT STEPS:')
print('  1. Check _attendance_logic_v4.json')
print('  2. Verify leave sections are replaced')
print('  3. Test with the automation')
print('=' * 60)
