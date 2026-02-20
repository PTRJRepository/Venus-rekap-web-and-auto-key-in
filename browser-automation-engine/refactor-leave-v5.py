"""
Refactor leave sections v5 - Handle the actual structure correctly
"""

import json
import sys
from pathlib import Path

# Fix Windows encoding
if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

template_path = Path(__file__).parent / 'templates' / '_attendance_logic_v3.json'
output_path = Path(__file__).parent / 'templates' / '_attendance_logic_v4.json'

print('=' * 60)
print('  REFACTOR LEAVE SECTIONS v5')
print('=' * 60)
print()

with open(template_path, 'r', encoding='utf-8') as f:
    template = json.load(f)

def process_structure(obj):
    """Process and replace leave sections"""
    if isinstance(obj, dict):
        # Check if this is the annual leave if block
        if (obj.get('comment') == 'Process ANNUAL LEAVE' and
            obj.get('action') == 'if'):
            print("Found ANNUAL LEAVE if block")

            # Check params.elseSteps for sick leave (not obj.elseSteps!)
            params = obj.get('params', {})
            else_steps = params.get('elseSteps', [])
            has_sick = any(
                item.get('comment') == 'Process SICK LEAVE'
                for item in else_steps
                if isinstance(item, dict)
            )

            if has_sick:
                print("  -> Contains SICK LEAVE in params.elseSteps")
                # Return two items: annual include + sick if block
                return [
                    {
                        "action": "include",
                        "params": {
                            "template": "_leave_input_full",
                            "params": {"leaveType": "annual"}
                        },
                        "comment": "═══ ANNUAL LEAVE (extracted) ═══"
                    },
                    {
                        "action": "if",
                        "params": {
                            "condition": "attendance.isSickLeave === true && !attendance.checkIn",
                            "thenSteps": [
                                {
                                    "action": "include",
                                    "params": {
                                        "template": "_leave_input_full",
                                        "params": {"leaveType": "sick"}
                                    },
                                    "comment": "═══ SICK LEAVE (extracted) ═══"
                                }
                            ]
                        },
                        "comment": "═══ Process SICK LEAVE ═══"
                    }
                ]
            else:
                # Just annual leave
                return {
                    "action": "include",
                    "params": {
                        "template": "_leave_input_full",
                        "params": {"leaveType": "annual"}
                    },
                    "comment": "═══ ANNUAL LEAVE (extracted) ═══"
                }

        # Process normal dict
        result = {}
        for key, value in obj.items():
            processed = process_structure(value)
            if isinstance(processed, list) and len(processed) > 0 and key in ['thenSteps', 'elseSteps']:
                # This is a steps array, and we got multiple items back
                result[key] = processed
            else:
                result[key] = processed
        return result

    elif isinstance(obj, list):
        result = []
        for item in obj:
            processed = process_structure(item)
            if isinstance(processed, list):
                # Multiple items returned, extend
                result.extend(processed)
            elif processed is not None:
                result.append(processed)
        return result

    return obj

print("Processing template...")
result = process_structure(template)

print("\n[OK] Refactoring complete!")

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"[OK] Saved to: {output_path.name}")

# Verify
print("\nVerifying result...")
with open(output_path, 'r', encoding='utf-8') as f:
    v4 = json.load(f)

count = json.dumps(v4).count('_leave_input_full')
print(f"Found {count} references to _leave_input_full")

# Check for sick leave
sick_count = json.dumps(v4).count('sick')
print(f"Found {sick_count} references to 'sick'")

print()
print('=' * 60)
