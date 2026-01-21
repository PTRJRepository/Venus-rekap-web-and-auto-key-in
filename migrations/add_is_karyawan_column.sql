-- Migration: Add is_karyawan column to employee_mill table
-- Run this SQL on extend_db_ptrj database

-- Add the column with default value true (1 = true for BIT type)
ALTER TABLE employee_mill
ADD is_karyawan BIT NOT NULL DEFAULT 1;

-- Verify the column was added
-- SELECT TOP 5 nik, venus_employee_id, employee_name, is_karyawan FROM employee_mill;
