ALTER TABLE feed_posts
    ADD COLUMN IF NOT EXISTS ward_id SMALLINT REFERENCES wards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feed_posts_ward_id ON feed_posts (ward_id);

UPDATE feed_posts fp
SET ward_id = (
    SELECT w.id
    FROM wards w
    WHERE w.is_active = TRUE
      AND w.city_code = 'HCMC'
      AND w.center_lat IS NOT NULL
      AND w.center_lng IS NOT NULL
    ORDER BY
      power(w.center_lat - fp.latitude::double precision, 2)
      + power(w.center_lng - fp.longitude::double precision, 2)
    LIMIT 1
)
WHERE fp.ward_id IS NULL
  AND fp.latitude IS NOT NULL
  AND fp.longitude IS NOT NULL;
