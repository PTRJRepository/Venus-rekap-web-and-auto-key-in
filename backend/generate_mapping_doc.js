require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { executeQuery, executeGatewayQuery } = require('./services/gateway');

async function generateMappingDoc() {
    try {
        console.log("Fetching unique Millware component combinations...");
        // PR_TASKCODE usually represents the ADCODE.
        // We look at actual data in PR_ADTRANS to see what DocDesc is used with what TaskCode.
        const millwareQuery = `
            SELECT DISTINCT 
                LTRIM(RTRIM(ISNULL(t.DocDesc, ''))) as DocDesc, 
                LTRIM(RTRIM(ISNULL(ln.TaskCode, ''))) as ADCode, 
                LTRIM(RTRIM(ISNULL(mt.TaskDesc, ''))) as TaskDesc
            FROM [db_ptrj_mill].[dbo].PR_ADTRANS t
            JOIN [db_ptrj_mill].[dbo].PR_ADTRANSLN ln ON t.ID = ln.MasterID
            LEFT JOIN [db_ptrj_mill].[dbo].PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
            WHERE t.DocDate >= '2026-01-01'
            
            UNION
            
            SELECT DISTINCT 
                LTRIM(RTRIM(ISNULL(t.DocDesc, ''))) as DocDesc, 
                LTRIM(RTRIM(ISNULL(ln.TaskCode, ''))) as ADCode, 
                LTRIM(RTRIM(ISNULL(mt.TaskDesc, ''))) as TaskDesc
            FROM [db_ptrj_mill].[dbo].PR_ADTRANS_ARC t
            JOIN [db_ptrj_mill].[dbo].PR_ADTRANSLN_ARC ln ON t.ID = ln.MasterID
            LEFT JOIN [db_ptrj_mill].[dbo].PR_TASKCODE mt ON ln.TaskCode = mt.TaskCode
            WHERE t.DocDate >= '2026-01-01'
            ORDER BY DocDesc, ADCode;
        `;
        const millwareData = await executeQuery(millwareQuery);


        console.log("Fetching unique Venus component combinations...");
        const venusQuery = `
            SELECT DISTINCT PYCompCode, PYCompName, PYType, IsTakeHomePay
            FROM [VenusHR14].[dbo].[HR_T_PYWeekly_DComponent]
            WHERE PYNumber LIKE 'PYW/PTRJ/2026%'
            ORDER BY PYType, PYCompName;
        `;
        const venusData = await executeQuery(venusQuery);

        // Helper to categorize Millware data based on docDescGuideBook mapping rules
        const getMillwareCategory = (row) => {
            const desc = (row.DocDesc || row.TaskDesc || '').toUpperCase();
            if (desc.includes('JABATAN')) return 'Tunjangan Jabatan';
            if (desc.includes('BERAS')) return 'Tunjangan Beras';
            if (desc.includes('MASA KERJA')) return 'Tunjangan Masa Kerja';
            if (desc.includes('LEMBUR') || desc.includes('OT JAM')) return 'Tunjangan Lembur';
            if (desc.includes('PREMI') && !desc.includes('PPH')) return 'Premi (Bonus/Insentif)';
            if (desc.includes('PPH') && !desc.includes('PREMI')) return 'Potongan PPh21';
            if (desc.includes('BPJS') && desc.includes('KESEHATAN')) return 'Potongan BPJS Kesehatan';
            if (desc.includes('BPJS') && (desc.includes('PENSIUN') || desc.includes('TK')) || desc.includes('JHT')) return 'Potongan BPJS Pensiun/TK';
            if (desc.includes('SPSI')) return 'Potongan SPSI';
            if (desc.includes('POTONGAN') || desc.includes('POT ')) return 'Potongan Lain';
            return 'Lainnya / Tidak Dikenali';
        };

        const groupedMillware = {};
        millwareData.forEach(row => {
            const cat = getMillwareCategory(row);
            if (!groupedMillware[cat]) groupedMillware[cat] = [];
            groupedMillware[cat].push(row);
        });

        // Generate Markdown
        let md = `# DocDesc & Component Mapping Data (Real Data 2026)\n\n`;
        md += `Dokumen ini berisi variasi nyata (real data) dari database Millware dan Venus sepanjang tahun 2026. Digunakan sebagai referensi untuk membuat sistem Auto Key-In.\n\n`;

        md += `## 1. Data Transaksi Millware (PR_ADTRANS)\n\n`;
        md += `Berikut adalah kombinasi \`DocDesc\` (Inputan Header Millware), \`ADCode\` (\`TaskCode\` di detail Millware), dan \`TaskDesc\` (Master Deskripsi Task) yang pernah digunakan:\n\n`;

        Object.keys(groupedMillware).sort().forEach(cat => {
            md += `### Kategori: ${cat}\n`;
            md += `| DocDesc (Input Header) | ADCode (TaskCode) | TaskDesc (Master Deskripsi) |\n`;
            md += `|---|---|---|\n`;
            groupedMillware[cat].forEach(row => {
                md += `| ${row.DocDesc || '*(KOSONG)*'} | ${row.ADCode || '-'} | ${row.TaskDesc || '-'} |\n`;
            });
            md += `\n`;
        });

        md += `## 2. Data Komponen Venus (HR_T_PYWeekly_DComponent)\n\n`;
        md += `Berikut adalah daftar semua komponen Upah/Gaji yang dihasilkan oleh sistem payroll Venus:\n\n`;
        md += `| Tipe | Kode Komponen | Nama Komponen (PYCompName) | Take Home Pay? |\n`;
        md += `|---|---|---|---|\n`;
        venusData.forEach(row => {
            md += `| ${row.PYType} | ${row.PYCompCode} | ${row.PYCompName} | ${row.IsTakeHomePay ? 'Ya' : 'Tidak'} |\n`;
        });
        md += `\n\n`;

        // Output to planning folder
        const outPath = path.join(__dirname, '..', '_dev_utils', 'planning', 'AutoKeyIn_MappingReference.md');
        fs.writeFileSync(outPath, md);
        console.log("Successfully generated:", outPath);

    } catch (e) {
        console.error("Error generating mapping:", e);
    }
}

generateMappingDoc();
