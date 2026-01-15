import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def apply_full_validation(steps, branch_name="Unknown"):
    new_steps = []
    i = 0
    while i < len(steps):
        step = steps[i]
        
        # Check for typeInput .CBOBox
        if step.get('action') == 'typeInput' and \
           '.ui-autocomplete-input.CBOBox' in step.get('params', {}).get('selector', ''):
            
            index = step.get('params', {}).get('index')
            
            # Determine Validator ID and Variable based on Index
            validator_id = ""
            var_name = ""
             
            if index == 1:
                # Task Code
                validator_id = "#MainContent_ddlTaskCode_RFV"
                var_name = "${chargeJobPart1Clean}"
                print(f"[{branch_name}] Found Part 1 (Task Code). Converting to Retry...")
            elif index == 2:
                # Account Code / Resource
                validator_id = "#MainContent_ddlAccountCode_RFV"
                var_name = "${chargeJobPart2}"
                print(f"[{branch_name}] Found Part 2 (Account/Resource). Converting to Retry...")
            elif index == 3:
                # Sub Block / Cost Center
                validator_id = "#MainContent_ddlSubBlock_RFV"
                var_name = "${chargeJobPart3}"
                print(f"[{branch_name}] Found Part 3 (Sub Block/Cost Center). Converting to Retry...")
            
            if validator_id:
                # Create Retry Action
                retry_step = {
                    "action": "retryInputWithValidation",
                    "comment": f"Input Part {index} with Validation Retry",
                    "params": {
                        "selector": ".ui-autocomplete-input.CBOBox",
                        "index": index,
                        "value": var_name,
                        "validationSelector": validator_id,
                        "maxRetries": 5
                    }
                }
                new_steps.append(retry_step)
                
                # Logic to Skip the manual setup steps that followed this typeInput
                # Pattern: Type -> Wait -> ArrowDown -> Wait -> Enter
                # OR pattern: Type -> Wait -> Enter (if stuck in old version)
                
                # We need to skip until we hit the next 'significant' action or another typeInput
                # BUT, we must Preserve the specific 3000ms Wait after Part 1
                
                skipped_count = 0
                idx = i + 1
                while idx < len(steps):
                    s = steps[idx]
                    
                    # Stop if we hit another typeInput or sensitive action
                    if s.get('action') in ['typeInput', 'click', 'parseChargeJob', 'waitForElement']:
                         break
                    
                    # Stop if we hit the 3000ms wait (Keep it!)
                    if s.get('action') == 'wait' and s.get('params', {}).get('duration') == 3000:
                        break
                        
                    # Skip basic navigation keys/waits
                    if s.get('action') in ['wait', 'pressKey']:
                         idx += 1
                         skipped_count += 1
                    else:
                        # Unknown action, safer to stop
                        break
                
                print(f"[{branch_name}] Skipped {skipped_count} manual steps.")
                i = idx
                
                # Re-insert the 3000ms wait if we are at Part 1 and it's missing (or we just stopped at it)
                if index == 1:
                     if i < len(steps) and steps[i].get('action') == 'wait' and steps[i].get('params', {}).get('duration') == 3000:
                         # Append it and increment i
                         new_steps.append(steps[i])
                         i += 1
                     else:
                         # It was swallowed or missing? Add it.
                         print(f"[{branch_name}] Re-injecting 3000ms wait for Part 1.")
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
        
        # Regular Branch
        if_step['params']['thenSteps'] = apply_full_validation(
            if_step.get('params', {}).get('thenSteps', []), 
            "REGULAR"
        )
        
        # Overtime Branch
        if_step['params']['elseSteps'] = apply_full_validation(
             if_step.get('params', {}).get('elseSteps', []),
             "OVERTIME"
        )
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=4, ensure_ascii=False)
            
        print("✅ Template updated with FULL validation retry logic (Parts 1, 2, 3).")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    update_template()
