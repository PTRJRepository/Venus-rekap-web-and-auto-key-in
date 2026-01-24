const fs = require('fs');
const path = require('path');

// 1. Configuration
// Using the most recent large export found
const SOURCE_FILE = 'ekstrak absen/export_attendance_2025-12-01_to_2025-12-19_20260114_114722.json';
const OUTPUT_FILE = 'browser-automation-engine/testing_data/overtime_data.json';

console.log(`🔍 Reading source file: ${SOURCE_FILE}`);

try {
    const rawData = fs.readFileSync(SOURCE_FILE, 'utf8');
    const sourceJson = JSON.parse(rawData);

    console.log(`📊 Original Data: ${sourceJson.data.length} employees`);

    // 2. Filter Logic
    let keptEmployees = 0;
    let keptDays = 0;

    const filteredEmployees = sourceJson.data.map(employee => {
        // Create a new Attendance object for this employee
        const filteredAttendance = {};
        let hasOvertime = false;

        // Iterate through all dates in Attendance
        if (employee.Attendance) {
            Object.entries(employee.Attendance).forEach(([date, record]) => {
                // CORE LOGIC: Keep only if overtimeHours > 0
                if (record.overtimeHours && record.overtimeHours > 0) {
                    filteredAttendance[date] = record;
                    hasOvertime = true;
                    keptDays++;
                }
            });
        }

        // Only return the employee if they have at least one overtime day
        if (hasOvertime) {
            keptEmployees++;
            return {
                ...employee,
                Attendance: filteredAttendance
            };
        }
        return null;
    }).filter(emp => emp !== null); // Remove nulls (employees with no overtime)

    // 3. Construct New JSON
    const newJson = {
        metadata: {
            ...sourceJson.metadata,
            onlyOvertime: true, // IMPORTANT: Flag for the engine
            description: "FILTERED DATA: Contains ONLY dates with Overtime > 0",
            generated_at: new Date().toISOString(),
            original_source: SOURCE_FILE
        },
        data: filteredEmployees
    };

    // 4. Save
    const outputPath = path.join(__dirname, OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(newJson, null, 2));

    console.log(`\n✅ Success! Created: ${OUTPUT_FILE}`);
    console.log(`   - Employees with Overtime: ${keptEmployees}`);
    console.log(`   - Total Overtime Days to Input: ${keptDays}`);
    console.log(`   - Metadata 'onlyOvertime' set to: true`);

} catch (error) {
    console.error("❌ Error:", error.message);
}
