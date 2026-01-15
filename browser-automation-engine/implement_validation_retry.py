import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def apply_validation_retry(steps, branch_name="Unknown"):
    new_steps = []
    i = 0
    while i < len(steps):
        step = steps[i]
        
        # Look for Task Code Input (CBOBox index 1)
        if step.get('action') == 'typeInput' and \
           step.get('params', {}).get('index') == 1 and \
           '.ui-autocomplete-input.CBOBox' in step.get('params', {}).get('selector', ''):
           
           print(f"[{branch_name}] Found Task Code input. Replacing with retryInputWithValidation...")
           
           # New Action
           retry_step = {
               "action": "retryInputWithValidation",
               "comment": "Input Task Code with Validation Retry",
               "params": {
                   "selector": ".ui-autocomplete-input.CBOBox",
                   "index": 1,
                   "value": "${chargeJobPart1Clean}",
                   "validationSelector": "#MainContent_ddlTaskCode_RFV",
                   "maxRetries": 5
               }
           }
           new_steps.append(retry_step)
           
           # Skip following steps that were part of the manual sequence
           # The sequence was: typeInput -> wait -> ArrowDown -> wait -> Enter 
           # AND potentially a 3000ms wait.
           # The action `retryInputWithValidation` handles type->arrow->enter internally.
           # It DOES NOT handle the 3000ms wait for page update. We should ADD that back manually after.
           
           # Skip Type
           # Skip Wait (1000)
           # Skip ArrowDown
           # Skip Wait (500)
           # Skip Enter
           # (We need to be careful to skipping EXACTLY what was there)
           
           # Look ahead
           skipped_count = 0
           idx = i + 1
           while idx < len(steps):
               s = steps[idx]
               # Heuristic: skip waits and keypresses until we hit something else or the specific 3000ms wait
               if s.get('action') in ['wait', 'pressKey']:
                   # Check if this is the 3000ms wait (keep this!)
                   if s.get('action') == 'wait' and s.get('params', {}).get('duration') == 3000:
                       # Stop skipping, we want to keep this
                       break
                   # Otherwise skip
                   idx += 1
                   skipped_count += 1
               else:
                   # Hit next input or something
                   break
           
           print(f"[{branch_name}] Skipped {skipped_count} manual steps.")
           i = idx
           
           # Determine if we need to add the 3000ms wait?
           # If the loop stopped at the 3000ms wait, it will be added in the next iteration of outer loop.
           # If it stopped at next input, we might be missing it if it wasn't there (but we added it before).
           # Let's explicitly check if the next step IS the 3000ms wait.
           if i < len(steps):
               next_s = steps[i]
               if next_s.get('action') == 'wait' and next_s.get('params', {}).get('duration') == 3000:
                   # It's there, let it be added normally
                   pass
               else:
                   # It's missing? Add it.
                   print(f"[{branch_name}] 3000ms wait missing? Adding it.")
                   new_steps.append({
                       "action": "wait", 
                       "params": {"duration": 3000, "comment": "Wait for page update after Task Code selection"}
                   })
           else:
                # End of steps
                new_steps.append({
                   "action": "wait", 
                   "params": {"duration": 3000, "comment": "Wait for page update after Task Code selection"}
                })
           
           continue

        new_steps.append(step)
        i += 1
    return new_steps

def update_template():
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
            
        steps = template.get('steps', [])
        forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
        forEach_steps = forEach_step.get('params', {}).get('steps', [])
        forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
        forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
        if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
        
        # Update Regular Branch
        then_steps = if_step.get('params', {}).get('thenSteps', [])
        if_step['params']['thenSteps'] = apply_validation_retry(then_steps, "REGULAR")
        
        # Update Overtime Branch
        else_steps = if_step.get('params', {}).get('elseSteps', [])
        if_step['params']['elseSteps'] = apply_validation_retry(else_steps, "OVERTIME")
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=4, ensure_ascii=False)
            
        print("✅ Template updated with validation retry logic.")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    update_template()
