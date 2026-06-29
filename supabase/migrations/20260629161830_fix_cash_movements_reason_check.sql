-- Fix cash_movements reason check constraint typo
-- 'เติมเงินท่อน' -> 'เติมเงินทอน'

ALTER TABLE public.cash_movements
DROP CONSTRAINT IF EXISTS cash_movements_reason_check;

ALTER TABLE public.cash_movements
ADD CONSTRAINT cash_movements_reason_check
CHECK (
  reason IN (
    'เติมเงินทอน',
    'ซื้อของเข้าร้าน',
    'เบิกเงินสด',
    'ฝากธนาคาร',
    'ปรับยอดเงินสด'
  )
);
