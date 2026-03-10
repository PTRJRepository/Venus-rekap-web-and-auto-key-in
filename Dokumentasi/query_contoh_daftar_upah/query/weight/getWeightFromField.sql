SELECT TOP (1000)
    -- Data dari Tabel Transaksi (Mill Weight)
    MW.[WbTicketNo] AS No_Tiket,
    MW.[DeliveryOrderNo] AS No_DO,
    MW.[DateHarvesting] AS Tgl_Panen,
    MW.[VehicleNo] AS No_Kendaraan,
    MW.[Weight] AS Berat_KG,
    MW.[Bunches] AS Janjang,
    MW.[Loosefruits] AS Brondolan,
    
    -- Data Mapping dari Tabel Master (Field Profile)
    FP.[Field_No] AS Kode_Blok,
    FP.[Field_Division] AS Divisi,
    FP.[Field_Type] AS Tipe_Tanaman,
    FP.[Hectare] AS Luas_Hektar,
    FP.[Total_Trees] AS Populasi_Pohon,
    FP.[Yield_Bracket] AS Kelas_Yield
    
FROM [staging_PTRJ_iFES_Plantware].[dbo].[iFES_MillWeight] AS MW
-- Melakukan JOIN berdasarkan FieldNo
LEFT JOIN [staging_PTRJ_iFES_Plantware].[dbo].[Field_Profile] AS FP 
    ON MW.[FieldNo] = FP.[Field_No] 
    AND MW.[FromOc] = FP.[OC_Code] -- Ditambahkan OC_Code agar mapping presisi per kebun/estate
ORDER BY MW.[InpDate] DESC;