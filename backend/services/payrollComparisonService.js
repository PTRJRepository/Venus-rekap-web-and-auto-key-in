const { executeQuery } = require('./gateway');

const toNumber = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
};

const toDeductionAmount = (value) => Math.abs(toNumber(value));

const normalizeSpsiDeduction = (value, phyMonth) => {
    const amount = toDeductionAmount(value);
    return phyMonth === 4 ? amount / 2 : amount;
};

const quoteSql = (value) => `'${String(value).replace(/'/g, "''")}'`;

const getPhyPeriodFromStartDate = (startDate) => {
    const [yearPart, monthPart] = String(startDate || '').split('-');
    const phyMonth = parseInt(monthPart, 10);
    const phyYear = parseInt(yearPart, 10);

    if (!Number.isInteger(phyMonth) || !Number.isInteger(phyYear)) {
        throw new Error(`Invalid payroll startDate: ${startDate}`);
    }

    return { phyMonth, phyYear };
};

/**
 * Fetch Millware payroll components for a list of employees and date range
 * Aligned with "Daftar Upah" system logic (db_ptrj_mill)
 * Using direct Amount accumulation from TASKREGLN/ARC for Overtime
 * 
 * @param {string[]} ptrjIds - Array of Millware Employee IDs (e.g., ['POM00017'])
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<Object>} Object mapping ptrjIds to their payroll component totals
 */
const fetchMillwarePayroll = async (ptrjIds, startDate, endDate) => {
    if (!ptrjIds || ptrjIds.length === 0) return {};

    try {
        const empList = ptrjIds.map(quoteSql).join(',');
        const { phyMonth, phyYear } = getPhyPeriodFromStartDate(startDate);

        // 1. Get PayRate from HR_PAYROLL
        const rateSql = `
            SELECT RTRIM(EmpCode) as emp_code, PayRate, RiceRation
            FROM [db_ptrj_mill].[dbo].HR_PAYROLL
            WHERE RTRIM(EmpCode) IN (${empList})
        `;
        const rates = await executeQuery(rateSql);
        const rateMap = {};
        rates.forEach(r => rateMap[r.emp_code] = r);

        // 2. Get HK and Overtime from TASKREG/TASKREGLN (Live & Archive)
        // HK: Unique TrxDate
        // Overtime: Direct SUM of Amount and Hours where OT = 1, filtered by header PhyMonth/PhyYear
        const workSql = `
            WITH WorkLines AS (
                SELECT
                    RTRIM(L.EmpCode) as emp_code,
                    CAST(L.TrxDate AS DATE) as trx_date,
                    L.OT,
                    L.Amount,
                    L.Hours
                FROM [db_ptrj_mill].[dbo].PR_TASKREG H
                INNER JOIN [db_ptrj_mill].[dbo].PR_TASKREGLN L ON H.ID = L.MasterID
                WHERE H.PhyMonth = ${phyMonth}
                  AND H.PhyYear = ${phyYear}
                  AND RTRIM(L.EmpCode) IN (${empList})

                UNION ALL

                SELECT
                    RTRIM(L.EmpCode) as emp_code,
                    CAST(L.TrxDate AS DATE) as trx_date,
                    L.OT,
                    L.Amount,
                    L.Hours
                FROM [db_ptrj_mill].[dbo].PR_TASKREG_ARC H
                INNER JOIN [db_ptrj_mill].[dbo].PR_TASKREGLN_ARC L ON H.ID = L.MasterID
                WHERE H.PhyMonth = ${phyMonth}
                  AND H.PhyYear = ${phyYear}
                  AND RTRIM(L.EmpCode) IN (${empList})
            )
            SELECT 
                emp_code,
                COUNT(DISTINCT CASE WHEN OT = 0 THEN trx_date END) as total_hk,
                SUM(CASE WHEN OT = 1 THEN Amount ELSE 0 END) as total_lembur_amount,
                SUM(CASE WHEN OT = 1 THEN Hours ELSE 0 END) as total_lembur_hours
            FROM WorkLines
            GROUP BY emp_code
        `;
        const workData = await executeQuery(workSql);
        const workMap = {};
        workData.forEach(w => workMap[w.emp_code] = w);

        // 3. Get Other Components (Allowances & Deductions) from PR_ADTRANS
        const adTransSql = `
            WITH Components AS (
                SELECT 
                    RTRIM(EmpCode) AS emp_code,
                    CASE 
                        WHEN match_text LIKE '%JABATAN%' OR match_text LIKE '%GA9128%' THEN 'tunjangan_jabatan'
                        WHEN match_text LIKE '%BERAS%' OR match_text LIKE '%RICE%' OR match_text LIKE '%AL0012%' THEN 'tunjangan_beras'
                        WHEN match_text LIKE '%MASA%KERJA%' OR match_text LIKE '%MASAKERJA%' OR match_text LIKE '%GA9129%' THEN 'tunjangan_masa_kerja'
                        WHEN match_text LIKE '%PREMI%PANEN%' OR match_text LIKE '%PREMI%AL%' THEN 'premi_panen'
                        WHEN match_text LIKE '%PREMI%KINERJA%' THEN 'premi_kinerja'
                        WHEN match_text LIKE '%PREMI%BRONDOL%' THEN 'premi_brondol'
                        WHEN match_text LIKE '%PREMI%INSENTIF%' THEN 'premi_insentif'
                        WHEN (match_text LIKE '%PREMI%' OR match_text LIKE '%BONUS%' OR match_text LIKE '%INSENTIF%') AND match_text NOT LIKE '%PPH%' THEN 'premi_lain'
                        WHEN match_text LIKE '%PPH%' THEN 'potongan_pph21'
                        WHEN match_text LIKE '%BPJS%KESEHATAN%' OR match_text LIKE '%BPJS%KES%' THEN 'potongan_bpjs_kesehatan'
                        WHEN match_text LIKE '%BPJS%PENSIUN%' OR match_text LIKE '%JHT%' OR match_text LIKE '%JP%TK%' THEN 'potongan_bpjs_pensiun'
                        WHEN match_text LIKE '%SPSI%' THEN 'potongan_spsi'
                        ELSE 'lainnya'
                    END AS type,
                    Amount
                FROM (
                    SELECT
                        t.EmpCode,
                        ln.Amount,
                        UPPER(CONCAT(ISNULL(t.DocDesc, ''), ' ', ISNULL(mt.TaskDesc, ''), ' ', ISNULL(ln.TaskCode, ''))) AS match_text
                    FROM (
                        SELECT EmpCode, ID, DocDesc, DocDate FROM [db_ptrj_mill].[dbo].PR_ADTRANS
                        WHERE RTRIM(EmpCode) IN (${empList})
                          AND PhyMonth = ${phyMonth}
                          AND PhyYear = ${phyYear}
                        UNION ALL
                        SELECT EmpCode, ID, DocDesc, DocDate FROM [db_ptrj_mill].[dbo].PR_ADTRANS_ARC
                        WHERE RTRIM(EmpCode) IN (${empList})
                          AND PhyMonth = ${phyMonth}
                          AND PhyYear = ${phyYear}
                    ) t
                    JOIN (
                        SELECT MasterID, TaskCode, Amount FROM [db_ptrj_mill].[dbo].PR_ADTRANSLN
                        UNION ALL
                        SELECT MasterID, TaskCode, Amount FROM [db_ptrj_mill].[dbo].PR_ADTRANSLN_ARC
                    ) ln ON t.ID = ln.MasterID
                    LEFT JOIN [db_ptrj_mill].[dbo].PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
                ) mapped
            )
            SELECT 
                emp_code,
                SUM(CASE WHEN type = 'tunjangan_jabatan' THEN Amount ELSE 0 END) as tunjangan_jabatan,
                SUM(CASE WHEN type = 'tunjangan_beras' THEN Amount ELSE 0 END) as tunjangan_beras_manual,
                SUM(CASE WHEN type = 'tunjangan_masa_kerja' THEN Amount ELSE 0 END) as tunjangan_masa_kerja,
                SUM(CASE WHEN type = 'premi_panen' THEN Amount ELSE 0 END) as premi_panen,
                SUM(CASE WHEN type = 'premi_kinerja' THEN Amount ELSE 0 END) as premi_kinerja,
                SUM(CASE WHEN type = 'premi_brondol' THEN Amount ELSE 0 END) as premi_brondol,
                SUM(CASE WHEN type = 'premi_insentif' THEN Amount ELSE 0 END) as premi_insentif,
                SUM(CASE WHEN type = 'premi_lain' THEN Amount ELSE 0 END) as premi_lain,
                SUM(CASE WHEN type = 'potongan_pph21' THEN Amount ELSE 0 END) as potongan_pph21,
                SUM(CASE WHEN type = 'potongan_bpjs_kesehatan' THEN Amount ELSE 0 END) as potongan_bpjs_kes,
                SUM(CASE WHEN type = 'potongan_bpjs_pensiun' THEN Amount ELSE 0 END) as potongan_bpjs_pen,
                SUM(CASE WHEN type = 'potongan_spsi' THEN Amount ELSE 0 END) as potongan_spsi,
                SUM(CASE WHEN type = 'lainnya' THEN Amount ELSE 0 END) as lainnya
            FROM Components
            GROUP BY emp_code
        `;
        const adTransData = await executeQuery(adTransSql);
        const adMap = {};
        adTransData.forEach(a => adMap[a.emp_code] = a);

        // 4. Combine all components into final results
        const finalResults = {};
        ptrjIds.forEach(id => {
            const empCode = id.trim();
            const rate = rateMap[empCode] || { PayRate: 0, RiceRation: 0 };
            const work = workMap[empCode] || { total_hk: 0, total_lembur_amount: 0, total_lembur_hours: 0 };
            const ad = adMap[empCode] || {
                tunjangan_jabatan: 0, tunjangan_beras_manual: 0, tunjangan_masa_kerja: 0,
                premi_panen: 0, premi_kinerja: 0, premi_brondol: 0, premi_insentif: 0, premi_lain: 0,
                potongan_pph21: 0, potongan_bpjs_kes: 0, potongan_bpjs_pen: 0, potongan_spsi: 0, lainnya: 0
            };

            const paidHk = toNumber(work.total_hk);
            const payRate = toNumber(rate.PayRate);
            const riceRation = toNumber(rate.RiceRation);
            const totalLemburAmount = toNumber(work.total_lembur_amount);
            const totalLemburHours = toNumber(work.total_lembur_hours);
            const tunjanganJabatan = toNumber(ad.tunjangan_jabatan);
            const tunjanganBerasManual = toNumber(ad.tunjangan_beras_manual);
            const tunjanganMasaKerja = toNumber(ad.tunjangan_masa_kerja);
            const premiPanen = toNumber(ad.premi_panen);
            const premiKinerja = toNumber(ad.premi_kinerja);
            const premiBrondol = toNumber(ad.premi_brondol);
            const premiInsentif = toNumber(ad.premi_insentif);
            const premiLain = toNumber(ad.premi_lain);
            const potonganPph21 = toDeductionAmount(ad.potongan_pph21);
            const potonganBpjsKes = toDeductionAmount(ad.potongan_bpjs_kes);
            const potonganBpjsPen = toDeductionAmount(ad.potongan_bpjs_pen);
            const potonganSpsi = normalizeSpsiDeduction(ad.potongan_spsi, phyMonth);
            const potonganLain = toDeductionAmount(ad.lainnya);

            const gajiPokokCalc = paidHk * payRate;
            const tunjanganBerasCalc = tunjanganBerasManual > 0 ? tunjanganBerasManual : (paidHk * riceRation);
            const totalPremi = premiPanen + premiKinerja + premiBrondol + premiInsentif + premiLain;
            const totalTunjangan = tunjanganJabatan + tunjanganBerasCalc + tunjanganMasaKerja + totalLemburAmount;
            const totalPotongan = potonganPph21 + potonganBpjsKes + potonganBpjsPen + potonganSpsi + potonganLain;
            const upahBersihCalc = (gajiPokokCalc + totalTunjangan + totalPremi) - totalPotongan;

            finalResults[empCode] = {
                emp_code: empCode,
                paid_hk: paidHk,
                pay_rate: payRate,
                rice_ration: riceRation,
                gaji_pokok: gajiPokokCalc,
                upj: (payRate * 30) / 173,
                tunjangan_jabatan: tunjanganJabatan,
                tunjangan_beras: tunjanganBerasCalc,
                tunjangan_masa_kerja: tunjanganMasaKerja,
                tunjangan_lembur: totalLemburAmount,
                jam_lembur: totalLemburHours,
                premi_panen: premiPanen,
                premi_kinerja: premiKinerja,
                premi_brondol: premiBrondol,
                premi_insentif: premiInsentif,
                premi_lain: premiLain,
                premi_total: totalPremi,
                potongan_pph21: potonganPph21,
                potongan_bpjs_kesehatan: potonganBpjsKes,
                potongan_bpjs_pensiun: potonganBpjsPen,
                potongan_spsi: potonganSpsi,
                potongan_lain: potonganLain,
                potongan_total: totalPotongan,
                upah_bersih: upahBersihCalc
            };
        });

        return finalResults;

    } catch (error) {
        console.error("[PayrollComparison] Error fetching Millware data:", error);
        throw error;
    }
};

module.exports = {
    fetchMillwarePayroll,
    normalizeSpsiDeduction
};
