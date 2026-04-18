-- Atomic increment for platform_stats to eliminate read-then-write race conditions.
-- The webhook calls this RPC instead of SELECT + UPDATE, so concurrent writes don't lose data.

CREATE OR REPLACE FUNCTION increment_platform_stats(
  p_vol_col TEXT,
  p_vol_amount BIGINT,
  p_fee_col TEXT,
  p_fee_amount BIGINT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Use dynamic SQL for column names, but only allow known column names (prevent SQL injection)
  IF p_vol_col NOT IN (
    'total_volume_sbtc', 'total_volume_stx',
    'total_fees_sbtc', 'total_fees_stx',
    'total_refunds_sbtc', 'total_refunds_stx'
  ) THEN
    RAISE EXCEPTION 'Invalid column name: %', p_vol_col;
  END IF;
  IF p_fee_col NOT IN (
    'total_volume_sbtc', 'total_volume_stx',
    'total_fees_sbtc', 'total_fees_stx',
    'total_refunds_sbtc', 'total_refunds_stx'
  ) THEN
    RAISE EXCEPTION 'Invalid column name: %', p_fee_col;
  END IF;

  IF p_vol_col = p_fee_col THEN
    -- Same column (e.g. refund updates): single increment
    EXECUTE format(
      'UPDATE platform_stats SET %I = COALESCE(%I, 0) + $1 WHERE id = 1',
      p_vol_col, p_vol_col
    ) USING p_vol_amount + p_fee_amount;
  ELSE
    -- Two different columns (volume + fees)
    EXECUTE format(
      'UPDATE platform_stats SET %I = COALESCE(%I, 0) + $1, %I = COALESCE(%I, 0) + $2 WHERE id = 1',
      p_vol_col, p_vol_col, p_fee_col, p_fee_col
    ) USING p_vol_amount, p_fee_amount;
  END IF;
END;
$$;

-- Restrict to service_role only (webhook uses service_role key)
REVOKE ALL ON FUNCTION increment_platform_stats FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_platform_stats FROM anon;
REVOKE ALL ON FUNCTION increment_platform_stats FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_platform_stats TO service_role;
