"""Prometheus 메트릭 정의."""
from prometheus_client import Counter, Histogram

events_processed_total = Counter(
    "sre_events_processed_total",
    "Total events processed by the SRE engine",
    ["action_code", "status"],
)

event_processing_seconds = Histogram(
    "sre_event_processing_seconds",
    "Event processing latency in seconds",
    buckets=[0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5],
)

redemptions_total = Counter(
    "sre_redemptions_total",
    "Total reward redemptions",
    ["status"],
)

balance_mismatches_total = Counter(
    "sre_balance_mismatches_total",
    "Total balance mismatches detected by verify_balance job",
)
