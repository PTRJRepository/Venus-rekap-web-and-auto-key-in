"""
Simple debug - just read and check
"""

import json
import sys
from pathlib import Path

if sys.stdout.encoding != 'utf-8':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

template_path = Path(__file__).parent / 'templates' / '_attendance_logic_v3.json'

with open(template_path, 'r', encoding='utf-8') as f:
    template = json.load(f)

# Helper function to find annual leave
def find_annual_leave(obj, depth=0, path=""):
    indent = "  " * depth

    if isinstance(obj, dict):
        comment = obj.get('comment', '')
        action = obj.get('action', '')

        if 'ANNUAL' in comment:
            print(f"{indent}FOUND ANNUAL at: {path}")
            print(f"{indent}  Comment: {comment}")
            print(f"{indent}  Action: {action}")
            if 'elseSteps' in obj:
                print(f"{indent}  Has elseSteps:")
                for i, item in enumerate(obj['elseSteps']):
                    if isinstance(item, dict):
                        c = item.get('comment', '')
                        a = item.get('action', '')
                        print(f"{indent}    [{i}] {a}: {c}")
                        if 'SICK' in c:
                            print(f"{indent}      ^^^ THIS IS SICK LEAVE!")

        for key, value in obj.items():
            find_annual_leave(value, depth + 1, f"{path}.{key}" if path else key)

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            find_annual_leave(item, depth, f"{path}[{i}]")

print("Searching for ANNUAL LEAVE...")
find_annual_leave(template)
