import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def verify():
    with open(file_path, 'r', encoding='utf-8') as f:
        template = json.load(f)

    steps = template.get('steps', [])
    forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
    forEach_steps = forEach_step.get('params', {}).get('steps', [])
    forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
    forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
    if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
    
    else_steps = if_step.get('params', {}).get('elseSteps', [])
    print(f"Total Overtime Steps: {len(else_steps)}")
    
    for i, step in enumerate(else_steps):
        # Print relevant parts (Action, Key if pressKey, Duration if wait, Selector/Index if typeInput)
        info = f"{step['action']}"
        if step['action'] == 'typeInput':
            info += f" idx={step.get('params', {}).get('index')} val={step.get('params', {}).get('value')}"
        if step['action'] == 'pressKey':
             info += f" key={step.get('params', {}).get('key')}"
        if step['action'] == 'wait':
             info += f" dur={step.get('params', {}).get('duration')}"
        
        print(f"Step {i+1}: {info}")

verify()
