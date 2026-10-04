# Person 1 Benchmarking

These scripts report measured results only.

## HTTP allocation benchmark

For an isolated development benchmark, set `ALLOW_DIRECT_ALLOCATION=true`, seed an event with at least as many seats as the request count, then run:

```bash
python benchmarks/load_test.py --url http://127.0.0.1:8000 --event benchmark --requests 1000 --workers 50
```

Record the actual environment and output. Do not present the result as a 10M-user capacity claim.

## Scale plan

Run progressively at 1K, 10K and 50K simulated/client-equivalent requests where the test environment permits. Record:

- concurrency
- requests/sec
- p50/p95/p99
- queue wait
- admission latency
- allocation latency
- error rate
- rate-limit events
- recovery time
- inventory invariant

The architecture target is separate from measured capacity.
