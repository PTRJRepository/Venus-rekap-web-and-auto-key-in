import json

# Read JSON
with open(r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace _variables prefix
content = content.replace('${_variables.chargeJobPart1Clean}', '${chargeJobPart1Clean}')
content = content.replace('${_variables.chargeJobPart2}', '${chargeJobPart2}')
content = content.replace('${_variables.chargeJobPart3}', '${chargeJobPart3}')
content = content.replace('${_variables.formattedDate}', '${formattedDate}')
content = content.replace('${_variables.formattedDateOT}', '${formattedDateOT}')

# Write back
with open(r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Replaced _variables prefix successfully")
