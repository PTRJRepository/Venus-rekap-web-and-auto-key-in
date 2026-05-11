const { executeQuery } = require('./gateway');
const { getAllEmployees } = require('./employeeMillService');

/**
 * WagesService - Perhitungan Daftar Upah (Payroll)
 *
 * Komponen:
 * - Gaji Pokok = HK × Payrate
 * - Tunjangan Beras = HK × RiceRation
 * - Tunjangan Jabatan = Fixed amount
 * - Tunjangan Masa Kerja = Fixed amount
 * - Lembur = Σ(Jam × Rate)
 * - Premi Brondol = SUM(Amount)
 * - Premi Dinamis = SUM(Amount)
 * - Potongan: BPJS Kesehatan, BPJS Pensiun, JHT, SPSI, PPh21
 *
 * Sumber Data:
 * - Venus: HR_T_PYWeekly_M, HR_T_PYWeekly_DComponent (via gateway)
 * - Millware: db_ptrj_mill (PR_ADTRANS, PR_TASKREG, PR_LOOSEFRUIT)
 */

// Konstanta untuk perhitungan
const BPJS_RATES = {
    kesehatan_pekerja: 0.01,    // 1%
    kesehatan_majikan: 0.04,    // 4%
    pensiun_pekerja: 0.01,       // 1%
    pensiun_majikan: 0.02,      // 2%
    jht_pekerja: 0.02,          // 2%
    jht_majikan: 0.037,         // 3.7%
    jkk_jkm_majikan: 0.0084     // 0.84%
};

const SPSI_DEFAULT = 5000; // Default SPSI per bulan

const toNumber = (value) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : 0;
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
 * Hitung Gaji Pokok
 * Formula: HK × Payrate
 */
const calculateGajiPokok = (hk, payrate) => {
    return (hk || 0) * (payrate || 0);
};

/**
 * Hitung Tunjangan Beras
 * Formula: HK × RiceRation
 */
const calculateTunjanganBeras = (hk, riceRation) => {
    return (hk || 0) * (riceRation || 0);
};

/**
 * Hitung BPJS Base
 * Formula: (Payrate × 30) + Tunjangan Masa Kerja
 */
const calculateBpjsBase = (payrate, masaKerja) => {
    const gajiStandar = (payrate || 0) * 30;
    return gajiStandar + (masaKerja || 0);
};

/**
 * Hitung Potongan BPJS Pekerja
 * Formula: (1% Kesehatan + 1% Pensiun + 2% JHT) × Base
 */
const calculateBpjsPekerja = (bpjsBase) => {
    const total = bpjsBase * (BPJS_RATES.kesehatan_pekerja + BPJS_RATES.pensiun_pekerja + BPJS_RATES.jht_pekerja);
    return Math.round(total);
};

/**
 * Hitung Potongan BPJS Majikan
 * Formula: (4% Kesehatan + 2% Pensiun + 3.7% JHT + 0.84% JKK/JKM) × Base
 */
const calculateBpjsMajikan = (bpjsBase) => {
    const total = bpjsBase * (
        BPJS_RATES.kesehatan_majikan +
        BPJS_RATES.pensiun_majikan +
        BPJS_RATES.jht_majikan +
        BPJS_RATES.jkk_jkm_majikan
    );
    return Math.round(total);
};

/**
 * Hitung PPh 21 menggunakan tarif TER
 * Simplified: Tanpa perhitungan bulanan yang kompleks
 */
const calculatePph21 = (penghasilanBruto, ptkp = 54000000) => {
    // Penghasilan bruto per tahun
    const yearlyIncome = (penghasilanBruto || 0) * 12;
    const pkp = Math.max(0, yearlyIncome - ptkp);

    // Tarif TER 2024
    let taxRate = 0;
    if (pkp <= 60000000) taxRate = 0.05;
    else if (pkp <= 250000000) taxRate = 0.15;
    else if (pkp <= 500000000) taxRate = 0.25;
    else if (pkp <= 5000000000) taxRate = 0.30;
    else taxRate = 0.35;

    const yearlyTax = pkp * taxRate;
    return Math.round(yearlyTax / 12); // Per bulan
};

/**
 * Ambil data payroll dari Millware (db_ptrj_mill)
 * Mengambil komponen tunjangan, lembur, premi, dan potongan
 */
const fetchMillwareWagesData = async (ptrjIds, startDate, endDate) => {
    if (!ptrjIds || ptrjIds.length === 0) return {};

    try {
        const empList = ptrjIds.map(quoteSql).join(',');

        // Query untuk mengambil semua komponen dari PR_ADTRANS
        const sql = `
            WITH PayrollComponents AS (
                SELECT
                    RTRIM(t.EmpCode) AS emp_code,
                    t.DocDesc AS doc_desc,
                    t.DocDate AS doc_date,
                    ln.TaskCode AS task_code,
                    ISNULL(mt.TaskDesc, ln.TaskCode) AS task_desc,
                    SUM(ln.Amount) AS amount,
                    CASE
                        -- TUNJANGAN
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%JABATAN%' THEN 'tunjangan_jabatan'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%BERAS%' THEN 'tunjangan_beras'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%MASA%KERJA%' THEN 'tunjangan_masa_kerja'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%LEMBUR%' THEN 'ignored_lembur'
                        -- PREMI (Dynamic)
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%PANEN%' OR UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%AL%' THEN 'premi_panen'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%KINERJA%' THEN 'premi_kinerja'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%BRONDOL%' THEN 'premi_brondol'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%INSENTIF%' THEN 'premi_insentif'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PREMI%' AND UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) NOT LIKE '%PPH%' THEN 'premi_lain'
                        -- POTONGAN
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PPH%' AND UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) NOT LIKE '%PREMI%' THEN 'potongan_pph21'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%BPJS%KESEHATAN%' AND UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%KARYAWAN%' THEN 'potongan_bpjs_kes'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%BPJS%KESEHATAN%' THEN 'potongan_bpjs_kes_majikan'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PENSIUN%' AND UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%KARYAWAN%' THEN 'potongan_bpjs_pen'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%PENSIUN%' THEN 'potongan_bpjs_pen_majikan'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%JHT%' THEN 'potongan_jht'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%SPSI%' THEN 'potongan_spsi'
                        WHEN UPPER(ISNULL(NULLIF(LTRIM(RTRIM(t.DocDesc)), ''), mt.TaskDesc)) LIKE '%KOREKSI%' THEN 'potongan_koreksi'
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
                GROUP BY RTRIM(t.EmpCode), t.DocDesc, t.DocDate, ln.TaskCode, mt.TaskDesc
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
                MAX(CASE WHEN component_type = 'potongan_bpjs_kes' THEN amount ELSE 0 END) AS potongan_bpjs_kes,
                MAX(CASE WHEN component_type = 'potongan_bpjs_kes_majikan' THEN amount ELSE 0 END) AS potongan_bpjs_kes_majikan,
                MAX(CASE WHEN component_type = 'potongan_bpjs_pen' THEN amount ELSE 0 END) AS potongan_bpjs_pen,
                MAX(CASE WHEN component_type = 'potongan_bpjs_pen_majikan' THEN amount ELSE 0 END) AS potongan_bpjs_pen_majikan,
                MAX(CASE WHEN component_type = 'potongan_jht' THEN amount ELSE 0 END) AS potongan_jht,
                MAX(CASE WHEN component_type = 'potongan_spsi' THEN amount ELSE 0 END) AS potongan_spsi,
                MAX(CASE WHEN component_type = 'potongan_koreksi' THEN amount ELSE 0 END) AS potongan_koreksi,
                MAX(CASE WHEN component_type = 'lainnya' THEN amount ELSE 0 END) AS lainnya
            FROM PayrollComponents
            GROUP BY emp_code;
        `;

        console.log(`[WagesService] Fetching Millware data for ${ptrjIds.length} employees`);
        const data = await executeQuery(sql);

        // Transform to map
        const result = {};
        data.forEach(row => {
            const empCode = row.emp_code ? row.emp_code.trim() : null;
            if (empCode) {
                // Calculate totals
                const tunjangan =
                    (row.tunjangan_jabatan || 0) +
                    (row.tunjangan_beras || 0) +
                    (row.tunjangan_masa_kerja || 0) +
                    (row.tunjangan_lembur || 0);

                const premi =
                    (row.premi_panen || 0) +
                    (row.premi_kinerja || 0) +
                    (row.premi_brondol || 0) +
                    (row.premi_insentif || 0) +
                    (row.premi_lain || 0);

                const potongan =
                    (row.potongan_pph21 || 0) +
                    (row.potongan_bpjs_kes || 0) +
                    (row.potongan_bpjs_pen || 0) +
                    (row.potongan_jht || 0) +
                    (row.potongan_spsi || 0) +
                    (row.potongan_koreksi || 0);

                result[empCode] = {
                    tunjangan_jabatan: row.tunjangan_jabatan || 0,
                    tunjangan_beras: row.tunjangan_beras || 0,
                    tunjangan_masa_kerja: row.tunjangan_masa_kerja || 0,
                    tunjangan_lembur: row.tunjangan_lembur || 0,
                    premi_panen: row.premi_panen || 0,
                    premi_kinerja: row.premi_kinerja || 0,
                    premi_brondol: row.premi_brondol || 0,
                    premi_insentif: row.premi_insentif || 0,
                    premi_lain: row.premi_lain || 0,
                    potongan_pph21: row.potongan_pph21 || 0,
                    potongan_bpjs_kes: row.potongan_bpjs_kes || 0,
                    potongan_bpjs_pen: row.potongan_bpjs_pen || 0,
                    potongan_jht: row.potongan_jht || 0,
                    potongan_spsi: row.potongan_spsi || 0,
                    potongan_koreksi: row.potongan_koreksi || 0,
                    // Totals
                    total_tunjangan: tunjangan,
                    total_premi: premi,
                    total_potongan: potongan
                };
            }
        });

        return result;

    } catch (error) {
        console.error("[WagesService] Error fetching Millware wages:", error);
        return {};
    }
};

/**
 * Ambil data lembur dari Millware (PR_TASKREG)
 */
const fetchMillwareOvertime = async (ptrjIds, startDate, endDate) => {
    if (!ptrjIds || ptrjIds.length === 0) return {};

    try {
        const empList = ptrjIds.map(quoteSql).join(',');
        const { phyMonth, phyYear } = getPhyPeriodFromStartDate(startDate);

        const sql = `
            SELECT
                emp_code,
                SUM(Hours) AS total_hours,
                SUM(Amount) AS total_amount
            FROM (
                SELECT
                    RTRIM(L.EmpCode) AS emp_code,
                    L.Hours,
                    L.Amount
                FROM [db_ptrj_mill].[dbo].PR_TASKREG H
                INNER JOIN [db_ptrj_mill].[dbo].PR_TASKREGLN L ON H.ID = L.MasterID
                WHERE RTRIM(L.EmpCode) IN (${empList})
                  AND H.PhyMonth = ${phyMonth}
                  AND H.PhyYear = ${phyYear}
                  AND L.OT = 1

                UNION ALL

                SELECT
                    RTRIM(L.EmpCode) AS emp_code,
                    L.Hours,
                    L.Amount
                FROM [db_ptrj_mill].[dbo].PR_TASKREG_ARC H
                INNER JOIN [db_ptrj_mill].[dbo].PR_TASKREGLN_ARC L ON H.ID = L.MasterID
                WHERE RTRIM(L.EmpCode) IN (${empList})
                  AND H.PhyMonth = ${phyMonth}
                  AND H.PhyYear = ${phyYear}
                  AND L.OT = 1
            ) t
            GROUP BY emp_code;
        `;

        const data = await executeQuery(sql);

        const result = {};
        data.forEach(row => {
            const empCode = row.emp_code ? row.emp_code.trim() : null;
            if (empCode) {
                result[empCode] = {
                    hours: toNumber(row.total_hours),
                    amount: toNumber(row.total_amount)
                };
            }
        });

        return result;

    } catch (error) {
        console.error("[WagesService] Error fetching Millware overtime:", error);
        return {};
    }
};

/**
 * Ambil data premi brondol dari Millware
 */
const fetchMillwareBrondol = async (ptrjIds, startDate, endDate) => {
    if (!ptrjIds || ptrjIds.length === 0) return {};

    try {
        const empList = ptrjIds.map(id => `'${id}'`).join(',');

        const sql = `
            SELECT
                RTRIM(lfln.EmpCode) AS emp_code,
                SUM(lfln.Amount) AS total_brondol
            FROM [db_ptrj_mill].[dbo].PR_LOOSEFRUIT_ARC lf
            JOIN [db_ptrj_mill].[dbo].PR_LOOSEFRUITLN_ARC lfln ON lf.ID = lfln.MasterID
            WHERE lfln.EmpCode IN (${empList})
              AND lf.DocDate >= '${startDate}' AND lf.DocDate < '${endDate}'
            GROUP BY RTRIM(lfln.EmpCode);
        `;

        const data = await executeQuery(sql);

        const result = {};
        data.forEach(row => {
            const empCode = row.emp_code ? row.emp_code.trim() : null;
            if (empCode) {
                result[empCode] = parseFloat(row.total_brondol) || 0;
            }
        });

        return result;

    } catch (error) {
        console.error("[WagesService] Error fetching Millware brondol:", error);
        return {};
    }
};

/**
 * Ambil data HK (Hari Kerja) dari Venus HR
 */
const fetchVenusHK = async (month, year) => {
    try {
        // Query untuk mengambil HK dari HR_T_TAMachine_Summary
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const sql = `
            SELECT
                EmployeeID,
                SUM(HK) AS total_hk
            FROM [VenusHR14].[dbo].HR_T_TAMachine_Summary
            WHERE PeriodMonth = ${month} AND PeriodYear = ${year}
            GROUP BY EmployeeID;
        `;

        const data = await executeQuery(sql);

        const result = {};
        data.forEach(row => {
            result[row.EmployeeID] = parseFloat(row.total_hk) || 0;
        });

        return result;

    } catch (error) {
        console.error("[WagesService] Error fetching Venus HK:", error);
        return {};
    }
};

/**
 * Ambil data lembur dari Venus HR_T_Overtime
 * Bukan dari ADTRANS - ini adalah jam lembur aktual per hari
 */
const fetchVenusOvertime = async (month, year) => {
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        const sql = `
            SELECT
                EmployeeID,
                SUM(OTHourDuration) AS total_hours,
                COUNT(*) AS total_days
            FROM [VenusHR14].[dbo].HR_T_Overtime
            WHERE OTDate >= '${startDate}' AND OTDate < '${endDate}'
              AND OTHourDuration > 0
            GROUP BY EmployeeID;
        `;

        console.log('[WagesService] Fetching Venus overtime:', sql.substring(0, 100));
        const data = await executeQuery(sql);

        const result = {};
        data.forEach(row => {
            result[row.EmployeeID] = {
                totalHours: parseFloat(row.total_hours) || 0,
                totalDays: parseInt(row.total_days) || 0
            };
        });

        return result;

    } catch (error) {
        console.error("[WagesService] Error fetching Venus overtime:", error);
        return {};
    }
};

/**
 * Ambil Payrate dan RiceRation dari HR_PAYROLL
 */
const fetchVenusPayrollRates = async () => {
    try {
        const sql = `
            SELECT
                p.EmpCode,
                p.PayRate,
                p.RiceRation
            FROM [VenusHR14].[dbo].HR_PAYROLL p
            JOIN [VenusHR14].[dbo].HR_EMPLOYEE e ON p.EmpCode = e.EmpCode
            WHERE e.Status = 'Active' OR e.TerminateDate IS NULL;
        `;

        const data = await executeQuery(sql);

        const result = {};
        data.forEach(row => {
            result[row.EmpCode] = {
                payrate: parseFloat(row.PayRate) || 0,
                riceRation: parseFloat(row.RiceRation) || 0
            };
        });

        return result;

    } catch (error) {
        console.error("[WagesService] Error fetching Venus payroll rates:", error);
        return {};
    }
};

/**
 * Ambil data payroll Venus (sudah ada dari HR_T_PYWeekly)
 */
const fetchVenusPayrollData = async (month, year) => {
    try {
        const period = `${year}${String(month).padStart(2, '0')}`;

        // Get header
        const mTableQuery = `
            SELECT EmployeeID, PYNumber, PYDate
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_M]
            WHERE PYNumber LIKE 'PYW/PTRJ/${period}/%'
        `;
        const mData = await executeQuery(mTableQuery);

        // Get detail components
        const dTableQuery = `
            SELECT PYNumber, PYCompCode, PYCompName, CompAmount, PYType, IsTakeHomePay
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_DComponent]
            WHERE PYNumber LIKE 'PYW/PTRJ/${period}/%'
        `;
        const dData = await executeQuery(dTableQuery);

        // Get employee mappings
        const millEmployees = await getAllEmployees();
        const millMap = {};
        millEmployees.forEach(me => {
            if (me.venus_employee_id) millMap[me.venus_employee_id] = me;
        });

        // Group by employee
        const payrollByEmp = {};

        mData.forEach(mRow => {
            const empId = mRow.EmployeeID;
            let mapData = millMap[empId];
            if (!mapData && empId.startsWith('PTRJ.')) {
                mapData = millMap[empId.replace('PTRJ.', '')];
            }

            payrollByEmp[empId] = {
                id: empId,
                name: mapData ? mapData.employee_name : empId,
                ptrjId: mapData ? mapData.ptrj_employee_id : null,
                chargeJob: mapData ? mapData.charge_job : null,
                gajiPokok: 0,
                tunjangan: {
                    beras: 0,
                    jabatan: 0,
                    masaKerja: 0,
                    lembur: 0
                },
                premi: {
                    brondol: 0,
                    insentif: 0,
                    kinerja: 0,
                    panen: 0,
                    lain: 0
                },
                potongan: {
                    pph21: 0,
                    bpjsKes: 0,
                    bpjsPen: 0,
                    jht: 0,
                    spsi: 0,
                    koreksi: 0
                },
                upahBersih: 0
            };
        });

        // Aggregate detail components
        dData.forEach(dRow => {
            const py = payrollByEmp[dRow.PYNumber];
            if (!py) return;

            const amount = parseFloat(dRow.CompAmount) || 0;
            const isTHP = dRow.IsTakeHomePay === true || dRow.IsTakeHomePay === 1;
            const compName = dRow.PYCompName || '';
            const compCode = dRow.PYCompCode || '';
            const n = compName.toUpperCase();

            if (isTHP) {
                py.upahBersih += amount;
            }

            if (compCode === '#GP#') {
                py.gajiPokok += amount;
            } else if (dRow.PYType === 'Addition' && compCode !== '#GP#') {
                // Tunjangan
                if (n.includes('BERAS')) py.tunjangan.beras += amount;
                else if (n.includes('JABATAN')) py.tunjangan.jabatan += amount;
                else if (n.includes('MASA KERJA')) py.tunjangan.masaKerja += amount;
                else if (n.includes('OT JAM') || n.includes('LEMBUR')) py.tunjangan.lembur += amount;
                // Premi
                else if (n.includes('BRONDOL')) py.premi.brondol += amount;
                else if (n.includes('INSENTIF')) py.premi.insentif += amount;
                else if (n.includes('KINERJA')) py.premi.kinerja += amount;
                else if (n.includes('PANEN')) py.premi.panen += amount;
                else py.premi.lain += amount;
            } else if (dRow.PYType === 'Deduction') {
                // Potongan
                if (n.includes('PPH21')) py.potongan.pph21 += Math.abs(amount);
                else if (n.includes('BPJS KESEHATAN') && n.includes('KARYAWAN')) py.potongan.bpjsKes += Math.abs(amount);
                else if (n.includes('PENSIUN') && n.includes('KARYAWAN')) py.potongan.bpjsPen += Math.abs(amount);
                else if (n.includes('JHT')) py.potongan.jht += Math.abs(amount);
                else if (n.includes('SPSI')) py.potongan.spsi += Math.abs(amount);
                else py.potongan.koreksi += Math.abs(amount);
            }
        });

        return payrollByEmp;

    } catch (error) {
        console.error("[WagesService] Error fetching Venus payroll:", error);
        return {};
    }
};

/**
 * Hitung jumlah upah kotor
 * = Gaji Pokok + Total Tunjangan + Total Premi
 */
const calculateJumlahUpahKotor = (gajiPokok, totalTunjangan, totalPremi) => {
    return (gajiPokok || 0) + (totalTunjangan || 0) + (totalPremi || 0);
};

/**
 * Hitung total potongan
 */
const calculateTotalPotongan = (bpjsKes, bpjsPen, jht, spsi, pph21, koreksi) => {
    return (bpjsKes || 0) + (bpjsPen || 0) + (jht || 0) + (spsi || 0) + (pph21 || 0) + (koreksi || 0);
};

/**
 * Hitung upah bersih
 */
const calculateUpahBersih = (jumlahUpahKotor, totalPotongan) => {
    return (jumlahUpahKotor || 0) - (totalPotongan || 0);
};

/**
 * Fetch complete wages data with Venus and Millware comparison
 *
 * Perhitungan Venus:
 * - Gaji Pokok = HK × Payrate (dari HR_PAYROLL × HR_T_TAMachine_Summary)
 * - Tunjangan Beras = HK × RiceRation (dari HR_PAYROLL)
 * - Lembur = Σ(Jam Lembur × Rate) (dari HR_T_Overtime, BUKAN dari ADTRANS)
 */
const fetchWagesData = async (month, year) => {
    try {
        console.log(`[WagesService] Fetching wages for ${month}/${year}`);

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        let nextMonth = month + 1;
        let nextYear = year;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear += 1;
        }
        const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

        // 1. Fetch employee mappings (for PTRJ ID)
        const millEmployees = await getAllEmployees();
        const millMap = {};
        millEmployees.forEach(me => {
            if (me.venus_employee_id) {
                millMap[me.venus_employee_id] = me;
            }
        });

        // 2. Fetch HK from HR_T_TAMachine_Summary
        const venusHK = await fetchVenusHK(month, year);

        // 3. Fetch Payrate & RiceRation from HR_PAYROLL
        const venusRates = await fetchVenusPayrollRates();

        // 4. Fetch Overtime hours from HR_T_Overtime (NOT from ADTRANS)
        const venusOvertime = await fetchVenusOvertime(month, year);

        // 5. Get unique employee IDs
        const empCodes = Object.keys(venusHK);

        // 6. Fetch Millware data
        const ptrjIds = [...new Set(
            Object.values(millMap)
                .filter(m => m.ptrj_employee_id)
                .map(m => m.ptrj_employee_id)
        )];
        const millwareData = await fetchMillwareWagesData(ptrjIds, startDate, endDate);
        const millwareOvertime = await fetchMillwareOvertime(ptrjIds, startDate, endDate);
        const millwareBrondol = await fetchMillwareBrondol(ptrjIds, startDate, endDate);

        // 7. Build comparison result - Calculate Venus from base components
        const result = empCodes.map(empCode => {
            const mapData = millMap[empCode];
            const hk = venusHK[empCode] || 0;
            const rates = venusRates[empCode] || { payrate: 0, riceRation: 0 };
            const overtime = venusOvertime[empCode] || { totalHours: 0, totalDays: 0 };

            // Calculate Venus components
            // Gaji Pokok = HK × Payrate
            const gajiPokok = calculateGajiPokok(hk, rates.payrate);

            // Tunjangan Beras = HK × RiceRation
            const tunjanganBeras = calculateTunjanganBeras(hk, rates.riceRation);

            // Lembur = Hours × (Payrate / 7 / 8) - simplify: assume 1/173 of payrate per hour
            const overtimeRate = rates.payrate / 173; // Upah per jam lembur
            const lemburAmount = overtime.totalHours * overtimeRate;

            // Tunjangan Jabatan & Masa Kerja - get from Venus payroll or assume 0
            const tunjanganJabatan = 0; // Need to get from HR_T_PYWeekly or configuration
            const tunjanganMasaKerja = 0; // Need to get from HR_T_PYWeekly or configuration

            // Calculate totals
            const venusTotalTunjangan = tunjanganBeras + tunjanganJabatan + tunjanganMasaKerja + lemburAmount;
            const venusTotalPremi = 0; // Need to get from HR_T_PYWeekly or PR_ADTRANS
            const venusTotalPotongan = 0; // Need to calculate or get from HR_T_PYWeekly
            const venusJumlahUpahKotor = gajiPokok + venusTotalTunjangan + venusTotalPremi;
            const venusUpahBersih = venusJumlahUpahKotor - venusTotalPotongan;

            // Get Millware data
            const ptrjId = mapData ? mapData.ptrj_employee_id : null;
            const mw = millwareData[ptrjId] || {};
            const mwOvertime = millwareOvertime[ptrjId] || {};
            const mwBrondol = millwareBrondol[ptrjId] || 0;
            const millwareLemburAmount = toNumber(mwOvertime.amount);
            const millwareLemburHours = toNumber(mwOvertime.hours);

            // Build Venus structure (calculated from base components)
            const venus = {
                hk: hk,
                payrate: rates.payrate,
                riceRation: rates.riceRation,
                gajiPokok: gajiPokok,
                tunjangan: {
                    beras: tunjanganBeras,
                    jabatan: tunjanganJabatan,
                    masaKerja: tunjanganMasaKerja,
                    lembur: lemburAmount
                },
                overtime: {
                    hours: overtime.totalHours,
                    days: overtime.totalDays,
                    rate: overtimeRate,
                    amount: lemburAmount
                },
                premi: {
                    brondol: 0,
                    insentif: 0,
                    kinerja: 0,
                    panen: 0,
                    lain: 0
                },
                potongan: {
                    pph21: 0,
                    bpjsKes: 0,
                    bpjsPen: 0,
                    jht: 0,
                    spsi: 0,
                    koreksi: 0
                },
                totalTunjangan: venusTotalTunjangan,
                totalPremi: venusTotalPremi,
                totalPotongan: venusTotalPotongan,
                jumlahUpahKotor: venusJumlahUpahKotor,
                upahBersih: venusUpahBersih
            };

            // Build Millware structure
            const millware = {
                // From PR_ADTRANS
                tunjangan: {
                    beras: mw.tunjangan_beras || 0,
                    jabatan: mw.tunjangan_jabatan || 0,
                    masaKerja: mw.tunjangan_masa_kerja || 0,
                    lembur: millwareLemburAmount
                },
                // From PR_TASKREG/PR_TASKREGLN lines where OT = 1
                overtime: {
                    hours: millwareLemburHours,
                    amount: millwareLemburAmount
                },
                // From PR_LOOSEFRUIT
                premi: {
                    brondol: mwBrondol,
                    panen: mw.premi_panen || 0,
                    kinerja: mw.premi_kinerja || 0,
                    insentif: mw.premi_insentif || 0,
                    lain: mw.premi_lain || 0
                },
                potongan: {
                    pph21: mw.potongan_pph21 || 0,
                    bpjsKes: mw.potongan_bpjs_kes || 0,
                    bpjsPen: mw.potongan_bpjs_pen || 0,
                    jht: mw.potongan_jht || 0,
                    spsi: mw.potongan_spsi || 0,
                    koreksi: mw.potongan_koreksi || 0
                }
            };

            // Calculate Millware totals
            const millwareTotalTunjangan =
                millware.tunjangan.beras +
                millware.tunjangan.jabatan +
                millware.tunjangan.masaKerja +
                millware.tunjangan.lembur;

            const millwareTotalPremi =
                millware.premi.brondol +
                millware.premi.panen +
                millware.premi.kinerja +
                millware.premi.insentif +
                millware.premi.lain;

            const millwareTotalPotongan =
                millware.potongan.pph21 +
                millware.potongan.bpjsKes +
                millware.potongan.bpjsPen +
                millware.potongan.jht +
                millware.potongan.spsi +
                millware.potongan.koreksi;

            // For Millware, we don't have Gaji Pokok directly, use 0 or calculate
            const millwareGajiPokok = 0;
            const millwareJumlahUpahKotor = millwareGajiPokok + millwareTotalTunjangan + millwareTotalPremi;
            const millwareUpahBersih = millwareJumlahUpahKotor - millwareTotalPotongan;

            // Comparison
            const comparison = {
                isMatch: Math.abs(venus.upahBersih - millwareUpahBersih) < 100, // 100 tolerance
                differences: {
                    gajiPokok: { venus: venus.gajiPokok, millware: millwareGajiPokok, diff: millwareGajiPokok - venus.gajiPokok },
                    tunjanganBeras: { venus: venus.tunjangan.beras, millware: millware.tunjangan.beras, diff: millware.tunjangan.beras - venus.tunjangan.beras },
                    tunjanganJabatan: { venus: venus.tunjangan.jabatan, millware: millware.tunjangan.jabatan, diff: millware.tunjangan.jabatan - venus.tunjangan.jabatan },
                    tunjanganMasaKerja: { venus: venus.tunjangan.masaKerja, millware: millware.tunjangan.masaKerja, diff: millware.tunjangan.masaKerja - venus.tunjangan.masaKerja },
                    tunjanganLembur: { venus: venus.tunjangan.lembur, millware: millware.tunjangan.lembur, diff: millware.tunjangan.lembur - venus.tunjangan.lembur },
                    overtimeHours: { venus: venus.overtime.hours, millware: millware.overtime.hours, diff: millware.overtime.hours - venus.overtime.hours },
                    premiBrondol: { venus: venus.premi.brondol, millware: millware.premi.brondol, diff: millware.premi.brondol - venus.premi.brondol },
                    premiInsentif: { venus: venus.premi.insentif, millware: millware.premi.insentif, diff: millware.premi.insentif - venus.premi.insentif },
                    premiKinerja: { venus: venus.premi.kinerja, millware: millware.premi.kinerja, diff: millware.premi.kinerja - venus.premi.kinerja },
                    premiPanen: { venus: venus.premi.panen, millware: millware.premi.panen, diff: millware.premi.panen - venus.premi.panen },
                    potonganPph21: { venus: venus.potongan.pph21, millware: millware.potongan.pph21, diff: millware.potongan.pph21 - venus.potongan.pph21 },
                    potonganBpjsKes: { venus: venus.potongan.bpjsKes, millware: millware.potongan.bpjsKes, diff: millware.potongan.bpjsKes - venus.potongan.bpjsKes },
                    potonganBpjsPen: { venus: venus.potongan.bpjsPen, millware: millware.potongan.bpjsPen, diff: millware.potongan.bpjsPen - venus.potongan.bpjsPen },
                    potonganJht: { venus: venus.potongan.jht, millware: millware.potongan.jht, diff: millware.potongan.jht - venus.potongan.jht },
                    potonganSpsi: { venus: venus.potongan.spsi, millware: millware.potongan.spsi, diff: millware.potongan.spsi - venus.potongan.spsi },
                    jumlahUpahKotor: { venus: venus.jumlahUpahKotor, millware: millwareJumlahUpahKotor, diff: millwareJumlahUpahKotor - venus.jumlahUpahKotor },
                    upahBersih: { venus: venus.upahBersih, millware: millwareUpahBersih, diff: millwareUpahBersih - venus.upahBersih }
                }
            };

            return {
                empCode: empCode,
                empName: mapData ? mapData.employee_name : empCode,
                ptrjId: ptrjId,
                chargeJob: mapData ? mapData.charge_job : null,
                // Venus data (calculated from base components)
                venus: {
                    hk: venus.hk,
                    payrate: venus.payrate,
                    riceRation: venus.riceRation,
                    gajiPokok: venus.gajiPokok,
                    tunjangan: venus.tunjangan,
                    overtime: venus.overtime,
                    premi: venus.premi,
                    potongan: venus.potongan,
                    totalTunjangan: venus.totalTunjangan,
                    totalPremi: venus.totalPremi,
                    totalPotongan: venus.totalPotongan,
                    jumlahUpahKotor: venus.jumlahUpahKotor,
                    upahBersih: venus.upahBersih
                },
                // Millware data
                millware: {
                    gajiPokok: millwareGajiPokok,
                    tunjangan: millware.tunjangan,
                    overtime: millware.overtime,
                    premi: millware.premi,
                    potongan: millware.potongan,
                    totalTunjangan: millwareTotalTunjangan,
                    totalPremi: millwareTotalPremi,
                    totalPotongan: millwareTotalPotongan,
                    jumlahUpahKotor: millwareJumlahUpahKotor,
                    upahBersih: millwareUpahBersih
                },
                // Comparison
                comparison
            };
        });

        console.log(`[WagesService] Returning ${result.length} employee wages`);
        return {
            success: true,
            data: result,
            period: { month, year }
        };

    } catch (error) {
        console.error("[WagesService] Error:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Get available periods from Venus payroll
 */
const getAvailablePeriods = async () => {
    try {
        const sql = `
            SELECT DISTINCT
                CAST(SUBSTRING(PYNumber, 12, 2) AS INT) AS month,
                CAST(SUBSTRING(PYNumber, 14, 4) AS INT) AS year
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_M]
            WHERE PYNumber LIKE 'PYW/PTRJ/%'
            ORDER BY year DESC, month DESC;
        `;

        const data = await executeQuery(sql);

        return {
            success: true,
            data: data.map(d => ({
                month: d.month,
                year: d.year,
                label: `${d.year}-${String(d.month).padStart(2, '0')}`
            }))
        };

    } catch (error) {
        console.error("[WagesService] Error getting periods:", error);
        return {
            success: false,
            error: error.message
        };
    }
};

module.exports = {
    // Calculation functions
    calculateGajiPokok,
    calculateTunjanganBeras,
    calculateBpjsBase,
    calculateBpjsPekerja,
    calculateBpjsMajikan,
    calculateJumlahUpahKotor,
    calculateTotalPotongan,
    calculateUpahBersih,
    // Data fetching
    fetchWagesData,
    fetchVenusPayrollData,
    fetchVenusOvertime,
    fetchMillwareWagesData,
    fetchMillwareOvertime,
    fetchMillwareBrondol,
    fetchVenusHK,
    fetchVenusPayrollRates,
    // Utils
    getAvailablePeriods,
    // Constants
    BPJS_RATES,
    SPSI_DEFAULT
};
