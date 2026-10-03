# FAIR DROP — P3 frontend / control center
`npm install && npm run dev` → http://localhost:3000. Click **RUN FAIR DROP DEMO**.
- All data is simulated (labeled SIMULATION MODE). `lib/types.ts` = shared contracts; `lib/sim.ts` = MockFairDropService (deterministic, seeded).
- To integrate P1/P2: implement `FairDropService` (WebSocket/SSE → Frame) and export it as `svc` in `lib/sim.ts`; map REST endpoints in a service layer.
- Fairness Lab (`lib/fairness.ts`) and Verification (`lib/proof.ts`) are real computations over simulated inputs.
