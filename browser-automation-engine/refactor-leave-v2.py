"""
Script untuk refactoring leave sections di _attendance_logic_v3.json
Version 2: Handle both annual and sick leave in one pass
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
print('  REFACTOR LEAVE SECTIONS v2')
print('=' * 60)
print()

# Read template
with open(template_path, 'r', encoding='utf-8') as f:
    content = f.read()
    template = json.loads(content)

def replace_leave_in_steps(steps, parent_info=""):
    """Replace leave sections in a steps array"""
    new_steps = []
    i = 0

    while i < len(steps):
        step = steps[i]

        # Check if this is an if block for annual leave
        if (step.get('action') == 'if' and
            step.get('comment', '').find('Process ANNUAL LEAVE') >= 0):
            print(f"Found ANNUAL LEAVE if block at {parent_info}[{i}]")

            # Check if elseSteps contains sick leave
            else_steps = step.get('elseSteps', [])
            has_sick_leave = any(
                s.get('comment', '').find('Process SICK LEAVE') >= 0 or
                s.get('action') == 'if' and s.get('comment', '').find('SICK LEAVE') >= 0
                for s in else_steps
            )

            if has_sick_leave:
                print("  -> Contains SICK LEAVE in elseSteps")
                # Replace with two includes - annual first, then check for sick
                new_steps.append({
                    "action": "include",
                    "params": {
                        "template": "_leave_input_full",
                        "params": {
                            "leaveType": "annual"
                        }
                    },
                    "comment": "═══ ANNUAL LEAVE (extracted) ═══"
                })

                # Add sick leave as a separate if block
                new_steps.append({
                    "action": "if",
                    "params": {
                        "condition": "attendance.isSickLeave === true && !attendance.checkIn",
                        "thenSteps": [
                            {
                                "action": "include",
                                "params": {
                                    "template": "_leave_input_full",
                                    "params": {
                                        "leaveType": "sick"
                                    }
                                },
                                "comment": "═══ SICK LEAVE (extracted) ═══"
                            }
                        ]
                    },
                    "comment": "═══ Process SICK LEAVE ═══"
                })
            else:
                # Just annual leave
                new_steps.append({
                    "action": "include",
                    "params": {
                        "template": "_leave_input_full",
                        "params": {
                            "leaveType": "annual"
                        }
                    },
                    "comment": "═══ ANNUAL LEAVE (extracted) ═══"
                })

            i += 1
        else:
            # Process nested structures
            if isinstance(step, dict):
                new_step = {}
                for key, value in step.items():
                    if key == 'thenSteps' and isinstance(value, list):
                        new_step[key] = replace_leave_in_steps(value, f"{parent_info}[{i}].thenSteps")
                    elif key == 'elseSteps' and isinstance(value, list):
                        new_step[key] = replace_leave_in_steps(value, f"{parent_info}[{i}].elseSteps")
                    elif key == 'params' and isinstance(value, dict) and 'steps' in value:
                        new_step[key] = step['params'].copy()
                        new_step[key]['steps'] = replace_leave_in_steps(value['steps'], f"{parent_info}[{i}].params.steps")
                    else:
                        new_step[key] = value
                new_steps.append(new_step)
            else:
                new_steps.append(step)
            i += 1

    return new_steps

print("Processing template...")
result = template.copy()
result['steps'] = replace_leave_in_steps(template['steps'], "steps")

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
