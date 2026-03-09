const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/.env') });
const { executeQuery } = require('../../backend/services/gateway');

async function testMillwarePayroll() {
    try {
        const empList = "'H0033'";
        const startDate = "2024-05-01"; // using older date as sample
        const endDate = "2026-06-01"; // wide range to catch something

        const sql = `
            WITH PayrollComponents AS (
                SELECT 
                    RTRIM(t.EmpCode) AS emp_code,
                    t.DocDesc AS doc_desc,
                    ln.TaskCode AS task_code,
                    mt.TaskDesc AS task_desc,
                    SUM(ln.Amount) AS amount,
                    CASE 
                        -- TUNJANGAN
                        WHEN UPPER(t.DocDesc) LIKE '%JABATAN%' THEN 'tunjangan_jabatan'
                        WHEN UPPER(t.DocDesc) LIKE '%BERAS%' THEN 'tunjangan_beras'
                        WHEN UPPER(t.DocDesc) LIKE '%MASA%KERJA%' THEN 'tunjangan_masa_kerja'
                        WHEN UPPER(t.DocDesc) LIKE '%LEMBUR%' THEN 'tunjangan_lembur'
                        -- PREMI (Dynamic)
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%PANEN%' OR UPPER(t.DocDesc) LIKE '%PREMI%AL%' THEN 'premi_panen'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%KINERJA%' THEN 'premi_kinerja'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%BRONDOL%' THEN 'premi_brondol'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%INSENTIF%' THEN 'premi_insentif'
                        WHEN UPPER(t.DocDesc) LIKE '%PREMI%' AND UPPER(t.DocDesc) NOT LIKE '%PPH%' THEN 'premi_lain'
                        -- POTONGAN
                        WHEN UPPER(t.DocDesc) LIKE '%PPH%' AND UPPER(t.DocDesc) NOT LIKE '%PREMI%' THEN 'potongan_pph21'
                        WHEN UPPER(t.DocDesc) LIKE '%BPJS%KESEHATAN%' THEN 'potongan_bpjs_kesehatan'
                        WHEN UPPER(t.DocDesc) LIKE '%BPJS%PENSIUN%' THEN 'potongan_bpjs_pensiun'
                        WHEN UPPER(t.DocDesc) LIKE '%SPSI%' THEN 'potongan_spsi'
                        WHEN UPPER(t.DocDesc) LIKE '%KOREKSI%' THEN 'potongan_koreksi'
                        WHEN UPPER(t.DocDesc) LIKE '%PINJAM%' THEN 'potongan_pinjaman'
                        WHEN UPPER(t.DocDesc) LIKE '%POT%' THEN 'potongan_lain'
                        ELSE 'lainnya'
                    END AS component_type
                FROM (
                    SELECT EmpCode, ID, DocDesc, DocDate
                    FROM [db_ptrj_mill].[dbo].PR_ADTRANS
                    WHERE RTRIM(EmpCode) IN (${empList})
                      AND DocDate >= '${startDate}' AND DocDate < '${endDate}'

                    UNION ALL

                    SELECT EmpCode, ID, DocDesc, DocDate
                    FROM [db_ptrj_mill].[dbo].PR_ADTRANS_ARC
                    WHERE RTRIM(EmpCode) IN (${empList})
                      AND DocDate >= '${startDate}' AND DocDate < '${endDate}'
                ) t
                JOIN (
                    SELECT MasterID, TaskCode, Amount
                    FROM [db_ptrj_mill].[dbo].PR_ADTRANSLN
                    UNION ALL
                    SELECT MasterID, TaskCode, Amount
                    FROM [db_ptrj_mill].[dbo].PR_ADTRANSLN_ARC
                ) ln ON t.ID = ln.MasterID
                LEFT JOIN [db_ptrj_mill].[dbo].PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
                WHERE ln.Amount > 0
                GROUP BY RTRIM(t.EmpCode), t.DocDesc, ln.TaskCode, mt.TaskDesc
            )
            SELECT 
                emp_code,
                MAX(CASE WHEN component_type = 'tunjangan_jabatan' THEN amount ELSE 0 END) AS tunjangan_jabatan,
                MAX(CASE WHEN component_type = 'tunjangan_beras' THEN amount ELSE 0 END) AS tunjangan_beras,
                MAX(CASE WHEN component_type = 'tunjangan_masa_kerja' THEN amount ELSE 0 END) AS tunjangan_masa_kerja,
                MAX(CASE WHEN component_type = 'tunjangan_lembur' THEN amount ELSE 0 END) AS tunjangan_lembur,
                MAX(CASE WHEN component_type = 'premi_panen' THEN amount ELSE 0 END) AS premi_panen,
                MAX(CASE WHEN component_type = 'premi_kinerja' THEN amount ELSE 0 END) AS premi_kinerja,
                MAX(CASE WHEN component_type = 'premi_brondol' THEN amount ELSE 0 END) AS premi_brondol,
                MAX(CASE WHEN component_type = 'premi_insentif' THEN amount ELSE 0 END) AS premi_insentif,
                MAX(CASE WHEN component_type = 'potongan_pph21' THEN amount ELSE 0 END) AS potongan_pph21,
                MAX(CASE WHEN component_type = 'potongan_bpjs_kesehatan' THEN amount ELSE 0 END) AS potongan_bpjs_kesehatan,
                MAX(CASE WHEN component_type = 'potongan_bpjs_pensiun' THEN amount ELSE 0 END) AS potongan_bpjs_pensiun,
                MAX(CASE WHEN component_type = 'potongan_spsi' THEN amount ELSE 0 END) AS potongan_spsi,
                MAX(CASE WHEN component_type = 'potongan_koreksi' THEN amount ELSE 0 END) AS potongan_koreksi
            FROM PayrollComponents
            GROUP BY emp_code
            ORDER BY emp_code;
        `;

        console.log("Executing Millware query...");
        const result = await executeQuery(sql);
        console.log("Result:", JSON.stringify(result, null, 2));

    } catch (e) {
        console.error("Error:", e);
    }
}

testMillwarePayroll();
