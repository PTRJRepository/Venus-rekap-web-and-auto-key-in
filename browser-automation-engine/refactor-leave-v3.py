"""
Script untuk refactoring leave sections v3
More direct approach - traverse the actual structure
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
print('  REFACTOR LEAVE SECTIONS v3')
print('=' * 60)
print()

with open(template_path, 'r', encoding='utf-8') as f:
    template = json.load(f)

def process_structure(obj):
    """Process and replace leave sections"""
    if isinstance(obj, dict):
        new_obj = {}
        for key, value in obj.items():
            if key in ['thenSteps', 'elseSteps'] and isinstance(value, list):
                # Check if this is the annual leave if block
                is_annual_leave = False
                for item in value:
                    if isinstance(item, dict) and item.get('comment') == 'Process ANNUAL LEAVE' and item.get('action') == 'if':
                        is_annual_leave = True
                        break

                if is_annual_leave:
                    # This is annual leave section - replace entire steps array
                    print("Found ANNUAL LEAVE section, replacing...")

                    # Check if elseSteps contains sick leave
                    has_sick = False
                    for item in value:
                        if isinstance(item, dict) and item.get('action') == 'if' and 'elseSteps' in item:
                            for else_item in item.get('elseSteps', []):
                                if isinstance(else_item, dict) and else_item.get('comment') == 'Process SICK LEAVE':
                                    has_sick = True
                                    break

                    if has_sick:
                        print("  -> Also contains SICK LEAVE in elseSteps")
                        # Replace with annual include + sick check
                        new_obj[key] = [
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
                        new_obj[key] = [
                            {
                                "action": "include",
                                "params": {
                                    "template": "_leave_input_full",
                                    "params": {"leaveType": "annual"}
                                },
                                "comment": "═══ ANNUAL LEAVE (extracted) ═══"
                            }
                        ]
                else:
                    new_obj[key] = process_structure(value)
            elif key == 'params' and isinstance(value, dict):
                new_obj[key] = process_structure(value)
            else:
                new_obj[key] = process_structure(value) if isinstance(value, (dict, list)) else value
        return new_obj
    elif isinstance(obj, list):
        return [process_structure(item) for item in obj]
    return obj

print("Processing template...")
result = process_structure(template)

print("\n[OK] Refactoring complete!")

with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print(f"[OK] Saved to: {output_path.name}")
print()
print('=' * 60)
