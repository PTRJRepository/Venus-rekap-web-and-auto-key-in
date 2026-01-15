import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'
output_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\verify_output.txt'

def verify():
    with open(file_path, 'r', encoding='utf-8') as f:
        template = json.load(f)

    steps = template.get('steps', [])
    forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
    forEach_steps = forEach_step.get('params', {}).get('steps', [])
    forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
    forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
    if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
    
    params = if_step.get('params', {})
    else_steps = params.get('elseSteps', [])
    
    with open(output_path, 'w', encoding='utf-8') as out:
        out.write(f"Total Overtime Steps (elseSteps): {len(else_steps)}\n")
        
        for i, step in enumerate(else_steps):
            if step['action'] == 'parseChargeJob':
                 out.write(f"\n--- CHARGE JOB SECTION START ---\n")

            info = f"{step['action']}"
            if step['action'] == 'typeInput':
                info += f" idx={step.get('params', {}).get('index')} val={step.get('params', {}).get('value')}"
            if step['action'] == 'pressKey':
                 info += f" key={step.get('params', {}).get('key')}"
            if step['action'] == 'wait':
                 info += f" dur={step.get('params', {}).get('duration')}"
            
            out.write(f"Step {i+1}: {info}\n")

verify()
