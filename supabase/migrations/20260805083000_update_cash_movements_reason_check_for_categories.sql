-- Allow the canonical cash movement categories introduced in the app policy.
-- Legacy reasons stay allowed at the database constraint level so historical rows
-- remain valid; the application API rejects new legacy writes.

ALTER TABLE public.cash_movements
DROP CONSTRAINT IF EXISTS cash_movements_reason_check;

ALTER TABLE public.cash_movements
ADD CONSTRAINT cash_movements_reason_check
CHECK (
  reason IN (
    'เติมเงินทอน',
    'เงินคืน / รับเงินสดอื่น',
    'ซื้อวัตถุดิบเข้าร้าน',
    'ซื้อบรรจุภัณฑ์ / ของใช้ร้าน',
    'ค่าใช้จ่ายร้าน',
    'ฝากธนาคาร',
    'เจ้าของถอนเงิน',
    'ปรับยอดเงินสด',
    -- legacy values kept for existing rows only; API policy blocks new inserts
    'ซื้อของเข้าร้าน',
    'เบิกเงินสด'
  )
);
