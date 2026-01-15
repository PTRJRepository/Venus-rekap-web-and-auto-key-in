import json
import os

file_path = r'd:\Gawean Rebinmas\Autofill Venus Millware\Rollback Venus Rekap Web\venus_autofill_rekap_web\Refactor_web_Rekap_Absen\browser-automation-engine\templates\attendance-input-loop.json'

def check():
    with open(file_path, 'r', encoding='utf-8') as f:
        d = json.load(f)

    # Navigate to THEN branch
    steps = d['steps']
    forEach = steps[11]
    pSteps = forEach['params']['steps']
    forEachProp = pSteps[1]
    pSteps2 = forEachProp['params']['steps']
    ifStep = pSteps2[1]
    thenSteps = ifStep['params']['thenSteps']

    print(f'Total steps: {len(thenSteps)}')
    
    # Print steps 14-20
    for i in range(14, 21):
        if i < len(thenSteps):
             s = thenSteps[i]
             print(f'Step {i+1}: {s.get("action")} - {s.get("comment", "")}')

check()
