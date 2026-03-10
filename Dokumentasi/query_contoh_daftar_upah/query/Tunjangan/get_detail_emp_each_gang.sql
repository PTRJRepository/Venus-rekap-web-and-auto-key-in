-- Query detail karyawan per gang untuk perbaikan masalah data kosong
-- Berdasarkan query backend_lama yang sudah bekerja

SELECT TOP 100
    e."EmpCode" as nik,
    e."EmpName" as nama,
    e."Gender" as jenis_kelamin,
    e."LocCode" as loc_code,
    g."GangCode" as gang_code,
    g."Status" as gang_status,
    -- Jumlah HK (Hari Kerja)
    (
        SELECT COALESCE(COUNT(CASE WHEN a.IsPresent = 'true' AND a.IsRestDay = 'false' AND a.IsHoliday = 'false' THEN 1 END), 0) as hk_count
        FROM PR_EMP_ATTN_ARC a
        WHERE a.EmpCode = e."EmpCode"
        AND a.AttnDate >= '2025-05-01'
        AND a.AttnDate < '2025-06-01'
    ) as hari_kerja,

    -- Gaji Pokok (dasar)
    COALESCE(p."PayRate", 0) as gaji_pokok,

    -- Total Tunjangan
    (
        -- Tunjangan Jabatan
        COALESCE(jabatan.jumlah, 0) as jabatan_jumlah,

        -- Tunjangan Masa Kerja
        COALESCE(masa_kerja.jumlah, 0) as masa_kerja_jumlah,

        -- Tunjangan Lembur
        COALESCE(lembur.jumlah, 0) as lembur_jumlah
    ) as total_tunjangan,

    -- Potongan BPJS
    (
        COALESCE(pot_bpjs_pekerja, 0) +
        COALESCE(pot_bpjs_majikan, 0) +
        COALESCE(pot_bpjs_pensiun_pekerja, 0) +
        COALESCE(pot_bpjs_pensiun_majikan, 0) +
        COALESCE(pot_bpjs_kesehatan_pekerja, 0) +
        COALESCE(pot_bpjs_kesehatan_majikan, 0) +
        COALESCE(pot_spsi, 0)
    ) as total_potongan_bpjs,

FROM HR_EMPLOYEE e
LEFT JOIN HR_GANGLN g ON g."GangMember" = e."EmpCode"
-- JOIN dengan PR_ADTRANS_ARC untuk tunjangan (pastikan query ini ada datanya)
LEFT JOIN (
    SELECT EmpCode, DocDesc, SUM(Amount) as jumlah
    FROM PR_ADTRANS_ARC
    WHERE DocDate >= '2025-05-01' AND DocDate < '2025-06-01'
    AND DocDesc LIKE '%TUNJANGAN%'
    GROUP BY EmpCode, DocDesc
) as tunjangan ON e."EmpCode" = tunjangan.EmpCode AND tunjangan.DocDesc = 'TUNJANGAN JABATAN'
LEFT JOIN (
    SELECT EmpCode, DocDesc, SUM(Amount) as jumlah
    FROM PR_ADTRANS_ARC
    WHERE DocDate >= '2025-05-01' AND DocDate < '2025-06-01'
    AND DocDesc = 'TUNJANGAN MASA KERJA'
    GROUP BY EmpCode
) as masa_kerja ON e."EmpCode" = masa_kerja.EmpCode AND masa_kerja.DocDesc = 'TUNJANGAN MASA KERJA'
LEFT JOIN (
    SELECT EmpCode, DocDesc, SUM(Amount) as jumlah
    FROM PR_ADTRANS_ARC
    WHERE DocDate >= '2025-05-01' AND DocDate < '2025-06-01'
    AND DocDesc LIKE '%LEMBUR%'
    GROUP BY EmpCode
) as lembur ON e."EmpCode" = lembur.EmpCode AND lembur.EmpCode IN (SELECT EmpCode FROM lembur WHERE TotalAmount > 0)

WHERE g."GangCode" = 'H1H'
ORDER BY e."EmpCode";