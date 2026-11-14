-- Query yang ditempel ke node Postgres (operation: Execute Query) di n8n.
-- Parameter $1, $2, ... diisi lewat opsi "Query Parameters" dengan expression array,
-- contoh: {{ [$json.source, $json.order_id, $json.phone, $json.total] }}

-- =====================================================================
-- Q1. Cek Riwayat  (node: "Cek Riwayat")
-- Params: [source, order_id, phone, total]
-- =====================================================================
SELECT
  (SELECT count(*) FROM orders
     WHERE source = $1 AND order_id = $2)::int                         AS exact_dup,
  (SELECT count(*) FROM orders
     WHERE phone = $3 AND total = $4::numeric
       AND created_at > now() - interval '30 minutes')::int           AS near_dup,
  (SELECT count(*) FROM orders
     WHERE phone = $3 AND status = 'REJECTED')::int                    AS prior_rejected,
  -- Pelanggan lama = punya pesanan sah yang lebih tua dari 1 hari.
  -- Batas 1 hari mencegah pesanan ganda yang baru masuk ikut dihitung sebagai "riwayat baik".
  (SELECT count(*) FROM orders
     WHERE phone = $3 AND status IN ('APPROVED_AUTO','APPROVED_MANUAL')
       AND created_at < now() - interval '1 day')::int                AS prior_ok;

-- =====================================================================
-- Q2. Simpan Pesanan + log  (node: "Simpan Pesanan")
-- Params: {{ $json.params }}  (array 21 elemen, disiapkan node "Tentukan Status")
-- ON CONFLICT menjaga dari webhook ganda yang datang bersamaan.
-- =====================================================================
WITH ins AS (
  INSERT INTO orders (
    order_id, source, customer_name, email, phone, address, city, postal_code,
    items, item_qty, payment_method, total,
    risk_score, risk_level, risk_reasons, tags,
    ai_verdict, ai_confidence, ai_reason, status, decided_by
  ) VALUES (
    $1, $2, $3, NULLIF($4, ''), $5, $6, $7, NULLIF($8, ''),
    $9::jsonb, $10::int, $11, $12::numeric,
    $13::int, $14, $15::jsonb, $16::jsonb,
    NULLIF($17, ''), NULLIF($18, '')::numeric, NULLIF($19, ''), $20, $21
  )
  ON CONFLICT (source, order_id) DO NOTHING
  RETURNING id, order_id, source, status
), lg AS (
  INSERT INTO order_logs (order_id, source, action, actor, note)
  SELECT order_id, source, status, $21, $19 FROM ins
)
SELECT * FROM ins;

-- =====================================================================
-- Q3. Catat Duplikat / Invalid  (node: "Catat Log")
-- Params: [order_id, source, action, note]
-- =====================================================================
INSERT INTO order_logs (order_id, source, action, note)
VALUES ($1, $2, $3, $4);

-- =====================================================================
-- Q4. Update Keputusan Owner  (node: "Update Keputusan", workflow approval)
-- Params: [status_baru, oleh, id]
-- Hanya mengubah pesanan yang masih PENDING_REVIEW, jadi tombol yang
-- ditekan dua kali tidak memproses ulang.
-- =====================================================================
WITH upd AS (
  UPDATE orders
     SET status = $1, decided_by = $2, updated_at = now()
   WHERE id = $3::bigint AND status = 'PENDING_REVIEW'
  RETURNING id, order_id, source, status, customer_name, total
), lg AS (
  INSERT INTO order_logs (order_id, source, action, actor)
  SELECT order_id, source, status, $2 FROM upd
)
SELECT * FROM upd;

-- =====================================================================
-- Q5. Ringkasan Harian  (node: "Ringkasan 24 Jam", workflow laporan)
-- =====================================================================
SELECT status,
       count(*)::int                 AS jumlah,
       coalesce(sum(total), 0)::bigint AS nilai
  FROM orders
 WHERE created_at >= now() - interval '1 day'
 GROUP BY status
 ORDER BY status;

-- =====================================================================
-- Q6. Daftar Order untuk halaman admin  (node: "Daftar Order", workflow API)
-- Params: [status]  ('ALL' = semua status)
-- Satu baris berisi dua array JSON: 200 order terbaru dan 30 aktivitas terakhir.
-- =====================================================================
SELECT
  (SELECT coalesce(json_agg(o ORDER BY o.created_at DESC), '[]'::json) FROM (
     SELECT id, order_id, source, customer_name, phone, city, items, item_qty,
            payment_method, total, risk_score, risk_level, risk_reasons, tags,
            ai_verdict, ai_confidence, ai_reason, status, decided_by, created_at, updated_at
       FROM orders
      WHERE $1 = 'ALL' OR status = $1
      ORDER BY created_at DESC
      LIMIT 200) o)                                                     AS orders,
  (SELECT coalesce(json_agg(l ORDER BY l.created_at DESC), '[]'::json) FROM (
     SELECT order_id, action, actor, note, created_at
       FROM order_logs
      ORDER BY created_at DESC
      LIMIT 30) l)                                                      AS activity;

-- =====================================================================
-- Q7. Statistik publik 30 hari  (node: "Statistik", workflow API)
-- Tanpa data pribadi: hanya hitungan, jadi aman ditampilkan di halaman depan.
-- =====================================================================
SELECT
  count(*)::int                                                        AS total,
  count(*) FILTER (WHERE status = 'APPROVED_AUTO')::int                AS auto_approved,
  count(*) FILTER (WHERE status = 'PENDING_REVIEW')::int               AS pending,
  count(*) FILTER (WHERE status = 'APPROVED_MANUAL')::int              AS approved_manual,
  count(*) FILTER (WHERE status = 'REJECTED')::int                     AS rejected,
  count(*) FILTER (WHERE risk_level = 'LOW')::int                      AS risk_low,
  count(*) FILTER (WHERE risk_level = 'MEDIUM')::int                   AS risk_medium,
  count(*) FILTER (WHERE risk_level = 'HIGH')::int                     AS risk_high,
  count(*) FILTER (WHERE ai_verdict IS NOT NULL)::int                  AS ai_checked,
  coalesce(round(avg(risk_score)), 0)::int                             AS avg_risk,
  (SELECT count(*) FROM order_logs
    WHERE action IN ('DUPLICATE', 'INVALID')
      AND created_at >= now() - interval '30 days')::int               AS blocked
  FROM orders
 WHERE created_at >= now() - interval '30 days';
