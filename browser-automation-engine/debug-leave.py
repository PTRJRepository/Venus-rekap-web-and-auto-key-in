"""
Debug script to find leave sections
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

def find_leaves(obj, path=""):
    """Find all leave if blocks"""
    if isinstance(obj, dict):
        comment = obj.get('comment', '')
        action = obj.get('action', '')

        if action == 'if':
            if 'ANNUAL' in comment or 'SICK' in comment:
                print(f"Found: {comment}")
                print(f"  Path: {path}")
                print(f"  Has elseSteps: {'elseSteps' in obj}")
                if 'elseSteps' in obj:
                    for i, item in enumerate(obj['elseSteps']):
                        if isinstance(item, dict):
                            c = item.get('comment', '')
                            a = item.get('action', '')
                            if a == 'if':
                                print(f"    elseSteps[{i}]: {c}")

        for key, value in obj.items():
            find_leaves(value, f"{path}.{key}" if path else key)

find_leaves(template)
