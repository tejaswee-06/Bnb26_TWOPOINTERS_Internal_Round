# Person 1 Judge Demo

1. Start PostgreSQL/Redis/API with Docker Compose.
2. Open `/docs`.
3. Create a 500-seat event and seed inventory.
4. Join users and show server-authoritative queue positions.
5. Admit a session with its credential.
6. Allocate using the signed admission token.
7. Replay the same idempotency key and show the same allocation.
8. Attempt a forged token and show rejection.
9. Attempt a direct allocation without admission and show rejection when `ALLOW_DIRECT_ALLOCATION=false`.
10. Run `benchmarks/load_test.py` against an appropriately sized test event.
11. Observe `/metrics` and `/resilience` for actual backend state.
12. Open `/verify/{allocation_id}` and show the allocation → session → reservation → inventory → audit chain.

Never present a benchmark number unless it was actually produced by the benchmark harness.
