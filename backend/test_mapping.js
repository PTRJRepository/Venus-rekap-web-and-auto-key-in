const { getEmployeeMillTable, getPTRJMapping } = require('./services/attendanceService');

async function test() {
    console.log("Checking mappings...");
    let mapping = getPTRJMapping();

    // Check if POM00194 is in the keys or values
    for (let [venusId, millwareId] of Object.entries(mapping)) {
        if (millwareId.includes('POM') || venusId.includes('POM')) {
            console.log(`Mapping: ${venusId} -> ${millwareId}`);
        }
    }
}

test().catch(console.error);
