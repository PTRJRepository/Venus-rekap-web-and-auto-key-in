import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def verify_template():
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
            
        steps = template.get('steps', [])
        forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
        forEach_steps = forEach_step.get('params', {}).get('steps', [])
        forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
        forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
        if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
        
        then_steps = if_step.get('params', {}).get('thenSteps', [])
        else_steps = if_step.get('params', {}).get('elseSteps', [])
        
        reg_found = any(s.get('action') == 'retryInputWithValidation' for s in then_steps)
        ot_found = any(s.get('action') == 'retryInputWithValidation' for s in else_steps)
        
        print(f"Regular Branch Validation Retry: {'✅ FOUND' if reg_found else '❌ MISSING'}")
        print(f"Overtime Branch Validation Retry: {'✅ FOUND' if ot_found else '❌ MISSING'}")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    verify_template()
