import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def insert_arrow_down(steps):
    # Iterate through steps and insert ArrowDown before Enter after typeInput
    new_steps = []
    i = 0
    while i < len(steps):
        step = steps[i]
        new_steps.append(step)
        
        # Check if this is a typeInput for ChargeJob parts (CBOBox)
        if step.get('action') == 'typeInput' and '.ui-autocomplete-input.CBOBox' in step.get('params', {}).get('selector', ''):
            # Look ahead for Enter key press
            # Usually: typeInput -> wait -> pressKey(Enter)
            # We want: typeInput -> wait -> pressKey(ArrowDown) -> wait -> pressKey(Enter)
            
            # Check next steps
            if i + 2 < len(steps):
                next_step_1 = steps[i+1] # Should be wait
                next_step_2 = steps[i+2] # Should be Enter
                
                if next_step_1.get('action') == 'wait' and \
                   next_step_2.get('action') == 'pressKey' and \
                   next_step_2.get('params', {}).get('key') == 'Enter':
                    
                    # Create ArrowDown step
                    arrow_step = {
                        "action": "pressKey",
                        "params": {
                            "key": "ArrowDown"
                        }
                    }
                     # Create additional wait step
                    wait_step = {
                        "action": "wait",
                        "params": {
                            "duration": 500
                        }
                    }
                    
                    # Insert after wait (steps[i+1]), before Enter (steps[i+2])
                    # Current new_steps has [..., typeInput]
                    # Next iteration will add wait
                    # We need to modify the sequence being built or just insert into new_steps later?
                    # Easier to look ahead and insert now?
                    
                    # Add the wait step
                    new_steps.append(next_step_1)
                     # Add ArrowDown
                    new_steps.append(arrow_step)
                    # Add wait
                    new_steps.append(wait_step)
                    # Add Enter
                    new_steps.append(next_step_2)
                    
                    # Skip the original next steps
                    i += 2
                else:
                    # Logic doesn't match expected pattern, just continue
                    pass
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
        new_then_steps = insert_arrow_down(then_steps)
        if_step['params']['thenSteps'] = new_then_steps
        print(f"ℹ️  Regular branch after: {len(new_then_steps)} steps")

        # Update Overtime Branch
        else_steps = if_step.get('params', {}).get('elseSteps', [])
        print(f"ℹ️  Overtime branch before: {len(else_steps)} steps")
        new_else_steps = insert_arrow_down(else_steps)
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
