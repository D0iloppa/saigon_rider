"""Saigon adapter constants shared by routes and jobs."""

USER_AGENT = "SaigonRiderReadOnly/1.0"
# core BOTS minus Yeti/Daumoa (KR-only); Coc Coc is unconfirmed so it is not listed.
# BOTS_VN = UA tokens C2 diagnosis checks in robots.txt; core/bot_policy.json = C7 visiting-bot verification
# policy. Different purposes, so when Coc Coc / Zalo get confirmed, update BOTH.
BOTS_VN = ('Googlebot', 'Bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot')
