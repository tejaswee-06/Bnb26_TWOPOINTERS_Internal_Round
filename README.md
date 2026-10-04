# 🛡️ FAIR DROP

## Selling 500 Seats to 50,000 People Without Letting Bots Win

> **Detect abuse. Protect legitimate users. Randomize admission. Preserve inventory. Prove fairness.**

<p align="center">
  🎟️ <b>FAIR DROP — High-Demand Ticketing & Fair Allocation Platform</b>
  <br/><br/>
  <sub>A real ticketing experience backed by behavioural intelligence, adversarial defense, randomized admission, transactional allocation and measurable fairness.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-React-000000?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js"/>
  <img src="https://img.shields.io/badge/TypeScript-Frontend-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/Python-ML-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/PostgreSQL-Database-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-Queue-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/ML-XGBoost%20%7C%20Isolation%20Forest-orange?style=for-the-badge" alt="Machine Learning"/>
</p>

---

# 🏆 BIT N BUILD — MAHARASHTRA ROUND

## Google Developer Groups On Campus — Fr. Conceicao Rodrigues College of Engineering

**Competition:** BIT N BUILD — Maharashtra Round  
**Track:** Web / App Development  
**Problem Statement:** PS3 — Fair Drop  
**Team:** TWOPOINTERS

---

# 🚨 The Problem

High-demand ticket drops are often won by whoever can connect fastest, refresh hardest, or automate the most aggressively.

When a limited inventory drop has thousands of legitimate users and automated clients competing simultaneously:

- Bots can generate thousands of requests.
- Repeated refreshes can overload the system.
- Multiple sessions can be coordinated.
- Legitimate users can face timeouts and inconsistent queues.
- Inventory can become vulnerable to duplicate or conflicting allocations.
- A system based purely on arrival speed can turn a ticket drop into a race between machines.

The real problem is therefore not simply:

> **"Can we detect bots?"**

It is:

> **"Can we keep a high-demand drop reliable and fair even when attackers actively try to manipulate it?"**

Fair Drop is built around this principle.

---

# 💡 Our Solution

**Fair Drop** is a high-demand ticketing and allocation platform designed to prevent automated clients from gaining significant advantage through:

- Request speed
- Request volume
- Repeated attempts
- Parallel sessions
- Coordinated behaviour
- Queue manipulation

Instead of making ML responsible for ticket allocation, Fair Drop separates **intelligence** from **authority**.

The system follows:

    TRAFFIC
       ↓
    BEHAVIOUR
       ↓
    ML INTELLIGENCE
       ↓
    RISK / COORDINATION
       ↓
    DETERMINISTIC POLICY
       ↓
    CONTROLLED ADMISSION
       ↓
    RANDOMIZED ALLOCATION
       ↓
    ATOMIC INVENTORY
       ↓
    VERIFICATION
       ↓
    FAIRNESS MEASUREMENT

This makes the system not only defensive, but measurable and auditable.

---

# 🎯 Core Principle

> **Speed should not be the allocation mechanism.**

Fair Drop intentionally separates the user journey into two concepts:

**Entry**

Users safely enter the pre-queue without receiving a speed-based allocation advantage.

**Admission**

After the eligible pool closes, the system determines admission order through a controlled randomized process.

Therefore:

    Fastest Request
          ✕
    Most Refreshes
          ✕
    Most Parallel Sessions
          ✕

             ↓

    Eligible Participant Pool
             ↓
       Randomized Order
             ↓
      Controlled Admission
             ↓
       Ticket Allocation

---

# 👤 Customer Experience

Fair Drop is not just an admin dashboard.

The customer side behaves like a real ticketing marketplace.

    DISCOVER EVENTS
          ↓
    SELECT EVENT
          ↓
    EVENT DETAILS
          ↓
    JOIN FAIR DROP
          ↓
    VERIFY
          ↓
    PRE-QUEUE
          ↓
    RANDOMIZED ADMISSION
          ↓
    ADMITTED
          ↓
    SELECT TICKET
          ↓
    RESERVE / HOLD
          ↓
    PAYMENT
          ↓
    CONFIRMATION
          ↓
    VERIFY ALLOCATION

### Customer Features

- Event discovery
- Search
- City selection
- Category navigation
- Movies
- Concerts
- Sports
- Comedy
- Theatre
- Seminars
- Workshops
- Offers
- My Tickets
- Event details
- Fair Drop entry
- Verification
- Pre-queue
- Randomized admission
- Ticket selection
- Reservation / hold
- Confirmation
- Allocation verification

---

# 🧠 Behavioural Intelligence

Fair Drop does not rely on a single rule such as:

> "High request rate = Bot."

Instead, the intelligence layer evaluates behavioural signals and coordinated activity.

Person 2's ML layer provides intelligence including:

- Bot probability
- Anomaly score
- Risk score
- Coordination score
- Attack type
- Campaign ID
- Session information
- Evidence
- Model version

The intelligence pipeline is:

    Session Behaviour
          ↓
    Feature Extraction
          ↓
    Behavioural Classification
          ↓
    Anomaly Detection
          ↓
    Coordination Analysis
          ↓
    Risk Event
          ↓
    Deterministic Policy

---

# 🕸️ Coordinated Attack Detection

A sophisticated attacker may not use one obvious bot.

They may distribute activity across:

- Multiple sessions
- Multiple accounts
- Multiple tokens
- Different request patterns
- Synchronized behaviour

Fair Drop therefore looks beyond individual requests.

The system can correlate suspicious sessions into behavioural campaigns.

    SESSION A ─┐
    SESSION B ─┼──→ BEHAVIOURAL CORRELATION
    SESSION C ─┤
    SESSION D ─┘
                    ↓
              CAMPAIGN DETECTED
                    ↓
              RISK EVALUATION

This allows the platform to reason about **coordinated abuse**, not just isolated suspicious requests.

---

# ⚙️ ML → Policy Separation

One of Fair Drop's most important architectural decisions is:

> **ML does not control inventory.**

The ML layer provides evidence.

The deterministic policy layer decides what action should happen.

Possible policy outcomes include:

    NORMAL
       ↓
    CHALLENGE
       ↓
    THROTTLE
       ↓
    QUARANTINE
       ↓
    REJECT

This separation prevents a probabilistic model from directly deciding who receives a scarce ticket.

The authoritative allocation system remains deterministic.

---

# 🎟️ Fair Pre-Queue

The pre-queue creates a controlled entry phase before admission.

Users can join safely without competing through request speed.

The system tracks:

- Eligible participants
- Buffered joins
- Policy-blocked sessions
- Duplicate attempts
- Suspicious participants
- Legitimate participant population

The key UX principle is:

> **Your arrival time does not directly determine your ticket allocation.**

Only after the pre-queue closes is the eligible pool finalized.

---

# 🎲 Verifiable Randomized Admission

After the eligible pool closes, Fair Drop creates a controlled randomized ordering.

    ELIGIBLE POOL
          ↓
    COMMITMENT
          ↓
    SEED
          ↓
    DETERMINISTIC SHUFFLE
          ↓
    ADMISSION ORDER
          ↓
    CONTROLLED ADMISSION

The resulting order can be independently checked against the published commitment and draw information.

This changes the fundamental allocation mechanism from:

> **"Who was fastest?"**

to:

> **"Who was eligible, and what did the verifiable allocation process produce?"**

---

# 🔐 Atomic Ticket Allocation

Once a user is admitted, ticket allocation is handled through transactional inventory states.

    AVAILABLE
        ↓
       HOLD
        ↓
    CONFIRMED

The system protects against:

- Duplicate allocations
- Overselling
- Conflicting requests
- Reservation races
- Expired holds
- Repeated requests
- Inconsistent inventory state

Idempotency is used so repeated requests do not create duplicate successful allocations.

---

# 🧪 Attack Lab

Fair Drop does not only demonstrate the system under normal traffic.

We actively attack it.

The Attack Lab can demonstrate scenarios involving:

- Request flooding
- High-frequency automation
- Repeated attempts
- Multi-session behaviour
- Coordinated activity
- Distributed attack patterns
- Low-and-slow behaviour

The important part is not simply generating traffic.

The important part is observing:

    ATTACK
       ↓
    DETECTION
       ↓
    CORRELATION
       ↓
    POLICY
       ↓
    MITIGATION
       ↓
    ADMISSION IMPACT
       ↓
    ALLOCATION IMPACT

---

# 📊 Fairness Lab

Fair Drop measures whether adversarial traffic actually changed the outcome for legitimate users.

The same legitimate population can be evaluated under two experimental worlds:

### WORLD A

    Legitimate Traffic Only

### WORLD B

    Same Legitimate Traffic
            +
    Adversarial Traffic

The system compares:

- Legitimate allocation
- Automated allocation
- Allocation gap
- Attack Allocation Advantage
- Queue distortion
- Inventory impact
- Overselling
- System performance

This transforms the claim of fairness into a measurable experiment.

---

# ⚖️ Attack Allocation Advantage

Fair Drop introduces a direct way to quantify whether attackers gained disproportionate access to scarce inventory.

Instead of saying:

> "Our bot detector works."

we ask:

> **"Did attackers actually gain an allocation advantage?"**

The system can compare:

    BOT / ATTACKER SHARE
             vs
    SEAT ALLOCATION SHARE

and measure the resulting allocation gap.

This makes the effectiveness of the defense measurable at the outcome level.

---

# 🔎 Allocation Verification

Fair Drop does not stop after allocation.

The result can be independently verified through the allocation proof mechanism.

The verification flow is:

    COMMITMENT
        ↓
    SEED / DRAW
        ↓
    ALLOCATION
        ↓
    RECOMPUTATION
        ↓
    VERIFICATION
        ↓
    ✓ VERIFIED

This provides an auditable explanation of how the allocation result was produced.

---

# 🖥️ Admin Command Center

The customer experience and operational intelligence are intentionally separated.

The customer sees a ticketing platform.

The operator sees a control center.

### Admin Sections

**Overview**

- Live drop state
- Participants
- Traffic
- Queue
- Inventory
- Admission
- System metrics

**Traffic**

- Live Traffic
- Queue
- Load Lab

**Intelligence**

- Detection
- Campaigns
- Attack Lab
- Risk Signals

**Admission**

- Pre-Queue
- Randomization
- Admission
- Allocations

**Fairness**

- Fairness Lab
- Allocation Advantage
- Verification

**Operations**

- Incidents
- System Health
- Reports

---

# 🧩 End-to-End Architecture

    ┌───────────────────────────────────────┐
    │           CUSTOMER PLATFORM           │
    │                                       │
    │ Events → Join → Verify → Pre-Queue    │
    │ → Admission → Purchase → Confirmation │
    └───────────────────┬───────────────────┘
                        │
                        ▼
    ┌───────────────────────────────────────┐
    │          FAIR DROP CONTROL            │
    │                                       │
    │ Admission + Policy + Allocation       │
    └───────────────┬───────────┬───────────┘
                    │           │
                    ▼           ▼
          ┌──────────────┐  ┌──────────────┐
          │ ML INTELLI-  │  │ INVENTORY /  │
          │ GENCE        │  │ ALLOCATION   │
          │              │  │              │
          │ Risk         │  │ Atomic State │
          │ Anomaly      │  │ Idempotency  │
          │ Coordination │  │ Holds        │
          │ Campaigns    │  │ Confirmation │
          └──────┬───────┘  └──────┬───────┘
                 │                  │
                 └────────┬─────────┘
                          ▼
                ┌───────────────────┐
                │ ADMIN CONTROL     │
                │ CENTER            │
                │                   │
                │ Intelligence      │
                │ Admission         │
                │ Fairness          │
                │ Operations        │
                └───────────────────┘

---

# 🏗️ Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Framer Motion
- Recharts

## Backend

- FastAPI
- Python
- REST APIs
- WebSockets / SSE architecture

## Data & State

- PostgreSQL
- Redis
- Transactional inventory
- Queue/session state

## Machine Learning

- Python
- scikit-learn
- XGBoost
- Isolation Forest
- Behavioural classification
- Anomaly detection
- Coordination analysis

## Security & Integrity

- HMAC / signed queue tokens
- Server-side validation
- Idempotency
- Commitment-based verification
- Queue bypass protection

## Simulation & Testing

- Python asyncio
- Locust
- Configurable adversarial traffic
- Flash-crowd simulation
- Fairness experiments
- Counterfactual evaluation

---

# 🔄 Complete System Flow

    USER ARRIVES
         ↓
    VERIFICATION
         ↓
    PRE-QUEUE
         ↓
    BEHAVIOURAL INTELLIGENCE
         ↓
    RISK / ANOMALY / COORDINATION
         ↓
    POLICY DECISION
         ↓
    ELIGIBLE POOL
         ↓
    COMMITMENT + RANDOMIZATION
         ↓
    CONTROLLED ADMISSION
         ↓
    TICKET HOLD
         ↓
    PAYMENT
         ↓
    CONFIRMATION
         ↓
    INVENTORY VALIDATION
         ↓
    ALLOCATION VERIFICATION
         ↓
    FAIRNESS ANALYSIS
         ↓
    INCIDENT REPORT

---

# 🧪 What We Measure

Fair Drop is designed around measurable outcomes rather than simply displaying detection scores.

### Security / Abuse

- Bot probability
- Anomaly score
- Coordination score
- Campaign detection
- Attack type
- Evidence

### System Performance

- Requests/sec
- Queue depth
- Active sessions
- p50 / p95 / p99 latency
- Load
- Admission rate

### Allocation Integrity

- Available seats
- Held seats
- Confirmed seats
- Expired holds
- Duplicate allocation attempts
- Overselling

### Fairness

- Legitimate allocation share
- Automated allocation share
- Allocation gap
- Attack Allocation Advantage
- World A vs World B difference

---

# 🛡️ Why Fair Drop?

Traditional anti-bot systems often stop at:

    REQUEST
       ↓
    DETECT BOT
       ↓
    BLOCK

Fair Drop goes further:

    REQUEST
       ↓
    UNDERSTAND BEHAVIOUR
       ↓
    CORRELATE ACTIVITY
       ↓
    ASSESS RISK
       ↓
    APPLY DETERMINISTIC POLICY
       ↓
    PROTECT ADMISSION
       ↓
    RANDOMIZE ELIGIBLE USERS
       ↓
    ALLOCATE TRANSACTIONALLY
       ↓
    VERIFY
       ↓
    MEASURE FAIRNESS

The system is therefore evaluated on the question that actually matters:

> **Did legitimate users remain protected when the system was attacked?**

---

# 🚀 Key Differentiators

| Capability | Fair Drop |
|---|---|
| Real ticketing experience | ✅ |
| Behavioural bot intelligence | ✅ |
| Anomaly detection | ✅ |
| Coordinated campaign detection | ✅ |
| Identity/session correlation | ✅ |
| Deterministic policy enforcement | ✅ |
| Speed-independent pre-queue | ✅ |
| Verifiable randomized admission | ✅ |
| Controlled admission | ✅ |
| Atomic inventory allocation | ✅ |
| Idempotency protection | ✅ |
| Attack simulation | ✅ |
| World A vs World B fairness testing | ✅ |
| Attack Allocation Advantage | ✅ |
| Allocation verification | ✅ |
| Incident reporting | ✅ |
| Admin operations center | ✅ |

---

# 🎯 The Core USP

Most systems ask:

> **"Can we detect the bot?"**

Fair Drop asks:

> **"Can the bot actually gain an unfair allocation advantage?"**

And then measures the answer.

Our system combines:

**INTELLIGENCE**

→ understand suspicious behaviour

**POLICY**

→ respond deterministically

**ADMISSION**

→ prevent speed from becoming allocation

**ALLOCATION**

→ protect inventory integrity

**VERIFICATION**

→ make the outcome auditable

**FAIRNESS**

→ measure whether attackers actually gained an advantage

---

# 🔮 Future Scope

Fair Drop can evolve toward production-scale high-demand commerce through:

- Distributed Redis-backed admission
- PostgreSQL-backed durable state
- Global load balancing
- Multi-region deployment
- Distributed rate limiting
- Persistent session recovery
- Real-time event streaming
- Production-grade challenge systems
- Larger-scale load testing
- Advanced coordinated attack detection
- Continuous adversarial model evaluation
- External randomness beacon integration
- Enterprise observability
- Automated incident response

The architecture targets large-scale flash-crowd environments, while measured capacity claims are reserved for validated benchmark results.

---

# 🏁 Demo Flow

For the complete demonstration:

    1. Open Fair Drop
          ↓
    2. Discover an event
          ↓
    3. Join the Fair Drop
          ↓
    4. Enter pre-queue
          ↓
    5. Open Admin Control Center
          ↓
    6. Launch adversarial traffic
          ↓
    7. Observe ML detection
          ↓
    8. Inspect campaign / risk evidence
          ↓
    9. Observe deterministic policy
          ↓
    10. Close pre-queue
          ↓
    11. Randomize eligible users
          ↓
    12. Admit controlled cohorts
          ↓
    13. Hold and confirm tickets
          ↓
    14. Verify allocation
          ↓
    15. Run World A vs World B
          ↓
    16. Measure Attack Allocation Advantage
          ↓
    17. Generate incident / fairness report

---

# 👥 Team TWOPOINTERS

### Tejaswee Rajput
**Team Lead**

### Rahul Sharma
**Team Member**

### Sohana Pilli
**Team Member**

---

<p align="center">
  <b>Built for BIT N BUILD — Maharashtra Round</b>
  <br/>
  <sub>Google Developer Groups On Campus — Fr. Conceicao Rodrigues College of Engineering</sub>
  <br/><br/>
  <b>FAIR DROP</b>
  <br/>
  <i>Don't just detect unfairness. Make fairness measurable.</i>
</p>
