import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def fix_template():
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            template = json.load(f)
        
        print("✅ Loaded template successfully")
        
        # Navigate to the loop steps
        # Structure: steps -> [forEach] -> params -> steps -> [forEachProperty] -> params -> steps -> [if] -> params -> thenSteps/elseSteps
        
        steps = template.get('steps', [])
        forEach_step = next((s for s in steps if s['action'] == 'forEach'), None)
        
        if not forEach_step:
            print("❌ Could not find 'forEach' step")
            return

        forEach_steps = forEach_step.get('params', {}).get('steps', [])
        forEachProperty_step = next((s for s in forEach_steps if s['action'] == 'forEachProperty'), None)
        
        if not forEachProperty_step:
            print("❌ Could not find 'forEachProperty' step")
            return

        forEachProperty_steps = forEachProperty_step.get('params', {}).get('steps', [])
        if_step = next((s for s in forEachProperty_steps if s['action'] == 'if'), None)
        
        if not if_step:
            print("❌ Could not find 'if' step")
            return

        print("✅ Found 'if' step structure")
        
        # Check Regular Branch (thenSteps)
        then_steps = if_step.get('params', {}).get('thenSteps', [])
        print(f"ℹ️  Regular branch has {len(then_steps)} steps")
        
        # Check if parseChargeJob already exists
        has_parse = any(s.get('action') == 'parseChargeJob' for s in then_steps)
        
        if not has_parse:
            print("⚠️ 'parseChargeJob' missing in Regular branch. inserting...")
            
            # Find insertion point (before Task Code input)
            insert_idx = -1
            for i, step in enumerate(then_steps):
                if step.get('comment') == 'Input Task Code (Part 1)':
                    insert_idx = i
                    break
            
            if insert_idx != -1:
                new_step = {
                    "action": "parseChargeJob",
                    "params": {
                        "chargeJob": "${employee.ChargeJob}"
                    }
                }
                then_steps.insert(insert_idx, new_step)
                print(f"✅ Inserted 'parseChargeJob' at index {insert_idx}")
            else:
                print("❌ Could not find insertion point 'Input Task Code (Part 1)' in Regular branch")
        else:
            print("✅ 'parseChargeJob' already exists in Regular branch")

        # Check Overtime Branch (elseSteps)
        else_steps = if_step.get('params', {}).get('elseSteps', [])
        print(f"ℹ️  Overtime branch has {len(else_steps)} steps")
        
        # Check if parseChargeJob already exists
        has_parse_else = any(s.get('action') == 'parseChargeJob' for s in else_steps)
        
        if not has_parse_else:
            print("⚠️ 'parseChargeJob' missing in Overtime branch. inserting...")
             # Find insertion point (before Task Code input)
            insert_idx = -1
            for i, step in enumerate(else_steps):
                if step.get('comment') == 'Input Task Code (Part 1)':
                    insert_idx = i
                    break
            
            if insert_idx != -1:
                new_step = {
                    "action": "parseChargeJob",
                    "params": {
                        "chargeJob": "${employee.ChargeJob}"
                    }
                }
                else_steps.insert(insert_idx, new_step)
                print(f"✅ Inserted 'parseChargeJob' at index {insert_idx} in Overtime branch")
            else:
                 print("❌ Could not find insertion point 'Input Task Code (Part 1)' in Overtime branch")

        else:
            print("✅ 'parseChargeJob' already exists in Overtime branch")

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
