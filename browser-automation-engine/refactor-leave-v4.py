"""
Refactor leave sections v4 - Handle nested elseSteps properly
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
print('  REFACTOR LEAVE SECTIONS v4')
print('=' * 60)
print()

with open(template_path, 'r', encoding='utf-8') as f:
    template = json.load(f)

def check_for_sick_leave(steps):
    """Check if steps array contains sick leave if block"""
    for item in steps:
        if isinstance(item, dict):
            if item.get('comment') == 'Process SICK LEAVE' and item.get('action') == 'if':
                return True
    return False

def process_structure(obj, depth=0):
    """Process and replace leave sections recursively"""
    if isinstance(obj, dict):
        # Check if this is the annual leave if block
        if obj.get('comment') == 'Process ANNUAL LEAVE' and obj.get('action') == 'if':
            print(f"{'  ' * depth}Found ANNUAL LEAVE if block")

            # Check elseSteps for sick leave
            else_steps = obj.get('elseSteps', [])
            has_sick = check_for_sick_leave(else_steps)

            if has_sick:
                print(f"{'  ' * depth}  -> Contains SICK LEAVE in elseSteps")
                # Return combined structure
                return {
                    "action": "include",
                    "params": {
                        "template": "_leave_input_full",
                        "params": {"leaveType": "annual"}
                    },
                    "comment": "═══ ANNUAL LEAVE (extracted) ═══"
                }, {
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

        # Check if this is the sick leave if block (standalone)
        if obj.get('comment') == 'Process SICK LEAVE' and obj.get('action') == 'if':
            print(f"{'  ' * depth}Found SICK LEAVE if block (standalone)")
            return {
                "action": "include",
                "params": {
                    "template": "_leave_input_full",
                    "params": {"leaveType": "sick"}
                },
                "comment": "═══ SICK LEAVE (extracted) ═══"
            }

        # Process normal dict
        result = {}
        for key, value in obj.items():
            processed = process_structure(value, depth + 1)
            if isinstance(processed, tuple):
                # Handle case where we return multiple items
                if key == 'thenSteps' or key == 'elseSteps':
                    # These are arrays, we can append the extra items
                    result[key] = list(processed)
                else:
                    # Unexpected, just take first
                    result[key] = processed[0]
                    # Add rest to parent somehow
            else:
                result[key] = processed
        return result

    elif isinstance(obj, list):
        result = []
        for item in obj:
            processed = process_structure(item, depth)
            if isinstance(processed, tuple):
                # Multiple items returned, extend the list
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

print()
print('=' * 60)
