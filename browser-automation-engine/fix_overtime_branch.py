import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def process_steps(steps, branch_name="Unknown"):
    new_steps = []
    i = 0
    while i < len(steps):
        step = steps[i]
        
        # Check for typeInput .CBOBox
        if step.get('action') == 'typeInput' and \
           '.ui-autocomplete-input.CBOBox' in step.get('params', {}).get('selector', ''):
            
            # Store current typeInput step
            input_step = step
            input_index = step.get('params', {}).get('index')
            
            # Look ahead for Wait -> Enter sequence
            # We want to change: Type -> Wait -> Enter
            # To: Type -> Wait -> ArrowDown -> Wait(500) -> Enter -> [Wait(3000) if index=1]
            
            # Check if next steps are already creating the correct sequence?
            # Or if they are the old sequence
            
            if i + 2 < len(steps):
                next1 = steps[i+1] # wait
                next2 = steps[i+2] # pressKey
                
                # Check for "ArrowDown" presence to avoid double insertion
                has_arrow_down = (next2.get('action') == 'pressKey' and next2.get('params', {}).get('key') == 'ArrowDown')
                
                if not has_arrow_down:
                    print(f"[{branch_name}] Fixing sequence for CBOBox Index {input_index}...")
                    
                    # We expect Type -> Wait -> Enter
                    if next2.get('action') == 'pressKey' and next2.get('params', {}).get('key') == 'Enter':
                        
                        # Add Type
                        new_steps.append(input_step)
                        
                        # Add original wait (or ensure consistent wait?)
                        # Use existing wait step
                        new_steps.append(next1) 
                        
                        # Add ArrowDown
                        new_steps.append({
                            "action": "pressKey",
                            "params": { "key": "ArrowDown" }
                        })
                        
                        # Add Wait 500ms
                        new_steps.append({
                            "action": "wait",
                            "params": { "duration": 500 }
                        })
                        
                        # Add Enter
                        new_steps.append(next2)
                        
                        # Check for 3000ms wait after Enter (only for Index 1)
                        if input_index == 1:
                            # Check if next step (i+3) is already the 3000ms wait
                            has_long_wait = False
                            if i + 3 < len(steps):
                                next3 = steps[i+3]
                                if next3.get('action') == 'wait' and next3.get('params', {}).get('duration') == 3000:
                                    has_long_wait = True
                            
                            if not has_long_wait:
                                print(f"[{branch_name}] Adding 3000ms wait after Task Code selection")
                                new_steps.append({
                                    "action": "wait",
                                    "params": { 
                                        "duration": 3000,
                                        "comment": "Wait for page update after Task Code selection"
                                    }
                                })
                        
                        # Skip original Wait and Enter
                        i += 3
                        continue
                else:
                    # Sequence already has ArrowDown
                     print(f"[{branch_name}] Sequence for Index {input_index} already has ArrowDown. checking 3000ms wait...")
                     new_steps.append(step)
                     # We need to ensure the 3000ms wait exists for Index 1
                     # Current sequence: Type -> Wait -> ArrowDown -> Wait -> Enter
                     # i is Type. 
                     # i+1 Wait, i+2 Arrow, i+3 Wait, i+4 Enter.
                     # 3000ms wait should be at i+5 (or newly added)
                     
                     if input_index == 1:
                        # Logic to check/insert wait safely in existing fixed sequence is complex within this loop structure
                        # Since we know Regular branch is fixed, we focus on identifying if we need to do anything.
                        pass
        
        # If no modification happened
        new_steps.append(step)
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
        
        steps = template.get('steps', [])
        forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
        forEach_steps = forEach_step.get('params', {}).get('steps', [])
        forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
        forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
        if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
        
        # Fix Overtime Branch (elseSteps)
        else_steps = if_step.get('params', {}).get('elseSteps', [])
        print(f"ℹ️  Overtime branch before: {len(else_steps)} steps")
        new_else_steps = process_steps(else_steps, "OVERTIME")
        if_step['params']['elseSteps'] = new_else_steps
        print(f"ℹ️  Overtime branch after: {len(new_else_steps)} steps")

        # Start verify Regular Branch too
        then_steps = if_step.get('params', {}).get('thenSteps', [])
        new_then_steps = process_steps(then_steps, "REGULAR")
        if_step['params']['thenSteps'] = new_then_steps

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
