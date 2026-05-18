-- nickname_words: 기본 닉네임 생성용 단어풀 (형용사 + 명사)
-- ProfileSetup 건너뛰기 시 "[Adjective] [Noun] [3자리숫자]" 조합으로 자동 부여

CREATE TABLE IF NOT EXISTS nickname_words (
    id          SERIAL PRIMARY KEY,
    word        VARCHAR(30)  NOT NULL,
    word_type   VARCHAR(10)  NOT NULL CHECK (word_type IN ('adjective', 'noun')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_nickname_words_word_type ON nickname_words (word, word_type);

-- Seed: adjectives (20)
INSERT INTO nickname_words (word, word_type) VALUES
    ('Brave',    'adjective'),
    ('Swift',    'adjective'),
    ('Lucky',    'adjective'),
    ('Wild',     'adjective'),
    ('Bold',     'adjective'),
    ('Fearless', 'adjective'),
    ('Midnight', 'adjective'),
    ('Thunder',  'adjective'),
    ('Golden',   'adjective'),
    ('Neon',     'adjective'),
    ('Urban',    'adjective'),
    ('Storm',    'adjective'),
    ('Shadow',   'adjective'),
    ('Blazing',  'adjective'),
    ('Savage',   'adjective'),
    ('Turbo',    'adjective'),
    ('Chrome',   'adjective'),
    ('Crimson',  'adjective'),
    ('Lone',     'adjective'),
    ('Iron',     'adjective')
ON CONFLICT DO NOTHING;

-- Seed: nouns (20)
INSERT INTO nickname_words (word, word_type) VALUES
    ('Rider',    'noun'),
    ('Cruiser',  'noun'),
    ('Nomad',    'noun'),
    ('Drifter',  'noun'),
    ('Voyager',  'noun'),
    ('Racer',    'noun'),
    ('Explorer', 'noun'),
    ('Phantom',  'noun'),
    ('Wolf',     'noun'),
    ('Hawk',     'noun'),
    ('Panther',  'noun'),
    ('Serpent',  'noun'),
    ('Arrow',    'noun'),
    ('Maverick', 'noun'),
    ('Rebel',    'noun'),
    ('Bullet',   'noun'),
    ('Viper',    'noun'),
    ('Spark',    'noun'),
    ('Titan',    'noun'),
    ('Phoenix',  'noun')
ON CONFLICT DO NOTHING;
