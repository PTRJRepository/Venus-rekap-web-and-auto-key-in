SELECT DISTINCT
       t.DocDesc
FROM   PR_ADTRANS_ARC AS t
WHERE  t.DocDesc LIKE '%kor%'
ORDER  BY t.DocDesc;
