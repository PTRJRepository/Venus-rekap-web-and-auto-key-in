require('dotenv').config({ path: '../../backend/.env' });
const { executeQuery } = require('../../backend/services/gateway');
const fs = require('fs');

async function test() {
    try {
        let out = "";
        out += "--- Checking HR_T_PYWeekly_DComponent ---\n";
        const cols1 = await executeQuery(`
            SELECT COLUMN_NAME, DATA_TYPE 
            FROM [VenusHR14].INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'HR_T_PYWeekly_DComponent'
            ORDER BY ORDINAL_POSITION
        `);
        out += JSON.stringify(cols1, null, 2) + "\n\n";

        out += "--- Checking HR_T_PYWeekly_HComponent ---\n";
        const tableHeader = await executeQuery(`
            SELECT TABLE_NAME
            FROM [VenusHR14].INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'HR_T_PYWeekly_HComponent'
        `);
        if (tableHeader.length > 0) {
            const cols2 = await executeQuery(`
                SELECT COLUMN_NAME, DATA_TYPE 
                FROM [VenusHR14].INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'HR_T_PYWeekly_HComponent'
            `);
            out += JSON.stringify(cols2, null, 2) + "\n\n";
        }

        out += "--- Sample Data HR_T_PYWeekly_DComponent ---\n";
        const data1 = await executeQuery(`
            SELECT TOP 5 * 
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_DComponent]
            WHERE [PYNumber] LIKE 'PYW/PTRJ/2026%'
        `);
        out += JSON.stringify(data1, null, 2) + "\n\n";

        out += "--- Finding Payroll Tables ---\n";
        const tables = await executeQuery(`
            SELECT TABLE_NAME 
            FROM [VenusHR14].INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%PYW%' OR TABLE_NAME LIKE '%Payroll%'
        `);
        out += JSON.stringify(tables, null, 2) + "\n\n";

        fs.writeFileSync('output.txt', out);
        console.log("Done. Check output.txt");
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
