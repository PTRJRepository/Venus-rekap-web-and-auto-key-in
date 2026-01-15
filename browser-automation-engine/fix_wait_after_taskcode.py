import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def insert_wait_after_chargejob_part1(steps):
    new_steps = []
    i = 0
    while i < len(steps):
        step = steps[i]
        new_steps.append(step)
        
        # Look for the Enter key press that follows Task Code input
        # Pattern: typeInput(ChargeJobPart1) -> wait -> pressKey(ArrowDown) -> wait -> pressKey(Enter)
        
        # We identify the sequence by looking for the Enter key press
        if step.get('action') == 'pressKey' and step.get('params', {}).get('key') == 'Enter':
            # Check if previous steps match the pattern for Task Code input
            # This is a heuristic: check if previous-previous-previous step was typeInput for index 1
            if i >= 4:
                prev_step_4 = steps[i-4] # Should be typeInput index 1
                if prev_step_4.get('action') == 'typeInput' and \
                   prev_step_4.get('params', {}).get('index') == 1 and \
                   '.ui-autocomplete-input.CBOBox' in prev_step_4.get('params', {}).get('selector', ''):
                    
                    print("✅ Found Task Code Enter confirmation. Inserting 3000ms wait.")
                    
                    # Insert wait
                    wait_step = {
                        "action": "wait",
                        "params": {
                            "duration": 3000,
                            "comment": "Wait for page update after Task Code selection"
                        }
                    }
                    new_steps.append(wait_step)
        
        i += 1
    return new_steps

def fix_template():
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
        
        print("✅ Loaded template successfully")
        
        # Navigate to Regular branch
        steps = template.get('steps', [])
        forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
        forEach_steps = forEach_step.get('params', {}).get('steps', [])
        forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
        forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
        if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
        
        # Update Regular Branch
        then_steps = if_step.get('params', {}).get('thenSteps', [])
        print(f"ℹ️  Regular branch before: {len(then_steps)} steps")
        new_then_steps = insert_wait_after_chargejob_part1(then_steps)
        if_step['params']['thenSteps'] = new_then_steps
        print(f"ℹ️  Regular branch after: {len(new_then_steps)} steps")

        # Update Overtime Branch
        else_steps = if_step.get('params', {}).get('elseSteps', [])
        print(f"ℹ️  Overtime branch before: {len(else_steps)} steps")
        new_else_steps = insert_wait_after_chargejob_part1(else_steps)
        if_step['params']['elseSteps'] = new_else_steps
        print(f"ℹ️  Overtime branch after: {len(new_else_steps)} steps")

        # Save changes
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=4, ensure_ascii=False)
        print("✅ Template saved successfully")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    fix_template()
