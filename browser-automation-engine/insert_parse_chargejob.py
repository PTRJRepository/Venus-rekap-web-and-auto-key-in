import json

# Read template
file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'
with open(file_path, 'r', encoding='utf-8') as f:
    template = json.load(f)

# Find forEach -> forEachProperty -> if (THEN branch) -> add parseChargeJob before task code input
# Navigate to the THEN branch
steps = template['steps']
forEach_step = steps[11]  # Step 12 (index 11) is forEach
forEach_steps = forEach_step['params']['steps']
forEachProperty_step = forEach_steps[1]  # Step 2 is forEachProperty  
forEachProperty_steps = forEachProperty_step['params']['steps']
if_step = forEachProperty_steps[1]  # Step 2 is if
then_branch = if_step['params']['thenSteps']

# Find the position to insert parseChargeJob
# Looking for the step BEFORE "Input Task Code (Part 1)" comment
insert_position = None
for i, step in enumerate(then_branch):
    if step.get('comment') == 'Input Task Code (Part 1)':
        insert_position = i
        break

if insert_position is None:
    print("❌ Could not find Task Code input step")
    exit(1)

# Create parseChargeJob step
parseChargeJob_step = {
    "action": "parseChargeJob",
    "params": {
        "chargeJob": "${employee.ChargeJob}"
    }
}

# Insert before task code input
then_branch.insert(insert_position, parseChargeJob_step)

print(f"✅ Inserted parseChargeJob at position {insert_position} in THEN branch (REGULAR)")

# Now find ELSE branch (overtime) and do the same
else_branch = if_step['params']['elseSteps']

# Find the position in ELSE branch
insert_position_else = None
for i, step in enumerate(else_branch):
    if step.get('comment') == 'Input Task Code (Part 1)':
        insert_position_else = i
        break

if insert_position_else is not None:
    else_branch.insert(insert_position_else, parseChargeJob_step.copy())
    print(f"✅ Inserted parseChargeJob at position {insert_position_else} in ELSE branch (OVERTIME)")
else:
    print("⚠️  Could not find Task Code input in ELSE branch")

# Write back
with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(template, f, indent=4, ensure_ascii=False)

print("✅ Template updated successfully")
