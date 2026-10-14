-- 255: 공식 계정 배지 — users.is_official. 관리자 콘솔 전용 가상 계정(015 시드, ADMIN_USER_ID)을 공식 계정으로 지정. 멱등.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT false;

-- 행이 있을 때만. nickname 은 UNIQUE 라 이미 다른 계정이 쓰면 닉네임은 건드리지 않는다.
UPDATE users
   SET is_official = true,
       nickname = CASE
           WHEN NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.nickname = 'Saigon Rider' AND u2.id <> users.id)
               THEN 'Saigon Rider'
           ELSE users.nickname
       END
 WHERE id = '00000000-0000-0000-0000-000000000001';
