const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const files = [
    'partitioned-template-1.yaml',
    'partitioned-template-2.yaml'
];

// The fix logic to structure as object
const createFixSteps = (existingSteps) => {
    return [
        {
            comment: '═══ VALIDATE TRANSACTION TYPE ═══',
            action: 'checkTransactionType',
            params: {
                expectedType: 'normal',
                saveTo: 'transactionTypeState'
            }
        },
        {
            comment: '═══ SKIP IF WRONG TRANSACTION TYPE (Data exists) ═══',
            action: 'if',
            params: {
                condition: 'context.transactionTypeMismatch',
                thenSteps: [
                    {
                        action: 'log',
                        params: {
                            message: '  ⚠️ SKIP: Transaction Type mismatch - data already exists. Refreshing...'
                        }
                    },
                    {
                        action: 'navigate',
                        params: {
                            url: 'http://millwarep3.rebinmas.com:8003/en/PR/trx/frmPrTrxTaskRegisterDet.aspx'
                        }
                    },
                    {
                        action: 'wait',
                        params: {
                            duration: 2000
                        }
                    }
                ],
                elseSteps: existingSteps
            }
        }
    ];
};

files.forEach(file => {
    const filePath = path.join(__dirname, 'templates', file);
    if (!fs.existsSync(filePath)) {
        console.log(`Skipping ${file} - not found`);
        return;
    }

    try {
        const doc = yaml.load(fs.readFileSync(filePath, 'utf8'));

        // Navigate to the Regular Input block
        // steps -> forEach (data.data) -> steps -> forEachProperty -> steps

        const outerLoop = doc.steps.find(s => s.action === 'forEach' && s.params.items === 'data.data');
        if (!outerLoop) throw new Error('Could not find outer forEach loop');

        const propertyLoop = outerLoop.params.steps.find(s => s.action === 'forEachProperty');
        if (!propertyLoop) throw new Error('Could not find inner forEachProperty loop');

        const innerSteps = propertyLoop.params.steps;

        // Find "Input REGULAR" if condition
        const regularIf = innerSteps.find(s =>
            s.action === 'if' &&
            (s.params.condition.includes('attendance.status') || s.params.condition.includes('!metadata.employeeInputFailed'))
        );

        if (!regularIf) throw new Error('Could not find Regular Input IF block');

        // Inside thenSteps of Regular IF
        const thenSteps = regularIf.params.thenSteps;

        // Find insertion point: After waiting for Shift dropdown and waiting 500ms
        // Look for 'parseChargeJob' - we want to insert BEFORE it
        const parseIndex = thenSteps.findIndex(s => s.action === 'parseChargeJob');

        if (parseIndex === -1) {
            console.log(`${file}: parseChargeJob not found in Regular block. Already modified?`);
            // Check if checkTransactionType is already there
            const hasCheck = thenSteps.find(s => s.action === 'checkTransactionType');
            if (hasCheck) console.log(`${file}: Fix already present.`);
            else console.log(`${file}: Unknown structure.`);
            return;
        }

        // Extract steps starting from parseIndex to end of thenSteps
        const remainingSteps = thenSteps.splice(parseIndex);

        // Create the fix structure wrapping remainingSteps
        const newSteps = createFixSteps(remainingSteps);

        // Insert new steps at parseIndex
        thenSteps.splice(parseIndex, 0, ...newSteps);

        console.log(`✅ Applied fix to ${file}`);

        // Save back
        fs.writeFileSync(filePath, yaml.dump(doc, {
            indent: 2,
            lineWidth: 120,
            noRefs: true
        }));

    } catch (e) {
        console.error(`❌ Failed to process ${file}: ${e.message}`);
    }
});
