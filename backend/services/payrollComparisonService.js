const { executeQuery } = require('./gateway');

/**
 * Fetch Millware payroll components for a list of employees and date range
 * Based on docDescGuideBook.md Query 5
 * 
 * @param {string[]} ptrjIds - Array of Millware Employee IDs (e.g., ['POM00017'])
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Object mapping ptrjIds to their payroll component totals
 */
const fetchMillwarePayroll = async (ptrjIds, startDate, endDate) => {
    if (!ptrjIds || ptrjIds.length === 0) return {};

    try {
        const empList = ptrjIds.map(id => `'${id}'`).join(',');

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
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%JABATAN%' THEN 'tunjangan_jabatan'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%BERAS%' THEN 'tunjangan_beras'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%MASA%KERJA%' THEN 'tunjangan_masa_kerja'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%LEMBUR%' THEN 'tunjangan_lembur'
                        -- PREMI (Dynamic)
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%PANEN%' OR UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%AL%' THEN 'premi_panen'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%KINERJA%' THEN 'premi_kinerja'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%BRONDOL%' THEN 'premi_brondol'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%INSENTIF%' THEN 'premi_insentif'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%' AND UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) NOT LIKE '%PPH%' THEN 'premi_lain'
                        -- POTONGAN
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PPH%' AND UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) NOT LIKE '%PREMI%' THEN 'potongan_pph21'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%BPJS%KESEHATAN%' THEN 'potongan_bpjs_kesehatan'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%BPJS%PENSIUN%' THEN 'potongan_bpjs_pensiun'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%SPSI%' THEN 'potongan_spsi'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%KOREKSI%' THEN 'potongan_koreksi'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PINJAM%' THEN 'potongan_pinjaman'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%POT%' THEN 'potongan_lain'
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
                MAX(CASE WHEN component_type = 'premi_lain' THEN amount ELSE 0 END) AS premi_lain,
                MAX(CASE WHEN component_type = 'potongan_pph21' THEN amount ELSE 0 END) AS potongan_pph21,
                MAX(CASE WHEN component_type = 'potongan_bpjs_kesehatan' THEN amount ELSE 0 END) AS potongan_bpjs_kesehatan,
                MAX(CASE WHEN component_type = 'potongan_bpjs_pensiun' THEN amount ELSE 0 END) AS potongan_bpjs_pensiun,
                MAX(CASE WHEN component_type = 'potongan_spsi' THEN amount ELSE 0 END) AS potongan_spsi,
                MAX(CASE WHEN component_type = 'potongan_koreksi' THEN amount ELSE 0 END) AS potongan_koreksi,
                MAX(CASE WHEN component_type = 'potongan_pinjaman' THEN amount ELSE 0 END) AS potongan_pinjaman,
                MAX(CASE WHEN component_type = 'potongan_lain' THEN amount ELSE 0 END) AS potongan_lain,
                MAX(CASE WHEN component_type = 'lainnya' THEN amount ELSE 0 END) AS lainnya
            FROM PayrollComponents
            GROUP BY emp_code;
        `;

        console.log(`[PayrollComparison] Fetching data for ${ptrjIds.length} employees from ${startDate} to ${endDate}`);
        const data = await executeQuery(sql);

        // Transform array to lookup map
        const result = {};
        data.forEach(row => {
            const empCode = row.emp_code ? row.emp_code.trim() : null;
            if (empCode) {
                result[empCode] = row;
            }
        });

        return result;

    } catch (error) {
        console.error("[PayrollComparison] Error fetching Millware payroll data:", error);
        throw error;
    }
};

module.exports = {
    fetchMillwarePayroll
};
