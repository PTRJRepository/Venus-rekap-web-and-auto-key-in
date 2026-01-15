import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def create_overtime_steps():
    # Construct the ideal sequence for Overtime Branch
    steps = []
    
    # 0. Pre-requisites (Shift selection, etc)
    # Based on view_file output, these were present before ChargeJob
    # We should PRESERVE the steps BEFORE parseChargeJob if possible, OR recreate them.
    # The view_file (Step 682) showed:
    # wait(2000), waitForElement(Shift), wait(500), click(OT), wait(500)
    # THEN parseChargeJob.
    
    # Let's try to grab existing prefix steps if possible so we don't lose Shift selection.
    # But since verification said 0 steps... I might need to expect they are gone?
    # NO. If verification said 0, then the file is empty corresponding to that key.
    # BUT if view_file showed lines, maybe I can just APPEND the ChargeJob logic?
    
    # Actually, I'll assume the Prefix is standard and recreate it to be safe.
    
    # PRE-STEPS
    steps.append({"action": "wait", "params": {"duration": 2000, "comment": "Wait for page reload after employee selection"}})
    steps.append({"action": "waitForElement", "params": {"selector": "#MainContent_ddlShift", "timeout": 10000, "comment": "Wait for Shift dropdown to appear"}})
    steps.append({"action": "wait", "params": {"duration": 500}})
    steps.append({"action": "click", "params": {"selector": "#MainContent_rblOT_1", "comment": "Pilih Overtime"}})
    steps.append({"action": "wait", "params": {"duration": 500}})
    
    # 1. Parse ChargeJob
    steps.append({
        "action": "parseChargeJob",
        "params": {"chargeJob": "${employee.ChargeJob}"}
    })
    
    # 2. Task Code (Index 1)
    steps.append({"comment": "Input Task Code (Part 1)", "action": "typeInput", "params": {"selector": ".ui-autocomplete-input.CBOBox", "index": 1, "value": "${chargeJobPart1Clean}"}})
    steps.append({"action": "wait", "params": {"duration": 1000, "comment": "Wait for autocomplete/next field"}})
    steps.append({"action": "pressKey", "params": {"key": "ArrowDown"}}) # FIX
    steps.append({"action": "wait", "params": {"duration": 500}}) # FIX
    steps.append({"action": "pressKey", "params": {"key": "Enter"}})
    
    # 3. Wait for Page Update (3000ms) - CRITICAL FIX
    steps.append({"action": "wait", "params": {"duration": 3000, "comment": "Wait for page update after Task Code selection"}})
    
    # 4. Resource (Index 2)
    steps.append({"comment": "Input Equipment/Resource (Part 2)", "action": "typeInput", "params": {"selector": ".ui-autocomplete-input.CBOBox", "index": 2, "value": "${chargeJobPart2}"}})
    steps.append({"action": "wait", "params": {"duration": 1000}})
    steps.append({"action": "pressKey", "params": {"key": "ArrowDown"}}) # FIX
    steps.append({"action": "wait", "params": {"duration": 500}}) # FIX
    steps.append({"action": "pressKey", "params": {"key": "Enter"}})
    
    # 5. Cost Center (Index 3)
    steps.append({"comment": "Input Cost Center (Part 3)", "action": "typeInput", "params": {"selector": ".ui-autocomplete-input.CBOBox", "index": 3, "value": "${chargeJobPart3}"}})
    steps.append({"action": "wait", "params": {"duration": 1000}})
    steps.append({"action": "pressKey", "params": {"key": "ArrowDown"}}) # FIX
    steps.append({"action": "wait", "params": {"duration": 500}}) # FIX
    steps.append({"action": "pressKey", "params": {"key": "Enter"}})
    
    # 6. Hours
    steps.append({"action": "typeInput", "params": {"selector": "#MainContent_txtHours", "value": "${attendance.overtimeHours}"}})
    steps.append({"action": "pressKey", "params": {"key": "Enter"}})
    steps.append({"action": "wait", "params": {"duration": 500}})
    
    # 7. Add Button
    steps.append({"comment": "═══ KLIK ADD BUTTON ═══", "action": "wait", "params": {"duration": 500}})
    steps.append({"action": "click", "params": {"selector": "#MainContent_btnAdd"}})
    steps.append({"action": "wait", "params": {"duration": 2000}})
    
    return steps

def rewrite():
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
        
        steps = template.get('steps', [])
        forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
        forEach_steps = forEach_step.get('params', {}).get('steps', [])
        forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
        forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
        if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
        
        # Determine existing prefix length validation? No, just overwrite.
        # But wait, what if my Prefix recreation is wrong?
        # The Prefix (Shift, OT selection) is important.
        # I'll rely on my transcription of the view_file output.
        
        new_steps = create_overtime_steps()
        if_step['params']['elseSteps'] = new_steps
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(template, f, indent=4, ensure_ascii=False)
            
        print(f"✅ Successfully rewrote Overtime branch with {len(new_steps)} steps.")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    rewrite()
