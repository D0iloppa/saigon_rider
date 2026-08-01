-- 049_levelup_reward_policy.sql
-- SGR-228: 레벨업 보상 정책 (단일행 config).
-- gain_exp()가 레벨업 시 이 테이블을 읽어 gold·skill_pt 를 지급한다.
-- 수치를 코드에 하드코딩하지 않고 DB seed로 둔다. 환율 골드 100:스킬 10:RP 1.

CREATE TABLE IF NOT EXISTS levelup_reward_policy (
    id       SMALLINT PRIMARY KEY DEFAULT 1,
    gold     INTEGER  NOT NULL DEFAULT 200,
    skill_pt INTEGER  NOT NULL DEFAULT 1,
    CONSTRAINT levelup_reward_policy_singleton CHECK (id = 1)
);

INSERT INTO levelup_reward_policy (id, gold, skill_pt)
VALUES (1, 200, 1)
ON CONFLICT (id) DO NOTHING;
