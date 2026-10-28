# How PSO and GWO work (and how this demo shows them)

This document explains both algorithms in full and maps every symbol to what you see on screen.
The code that runs them is `src/js/10_algorithms.js` (about 120 lines, no graphics). The 3D scene only *displays* its state.

## 1. The problem both of them solve

We want the point **x** where a function **f(x)** is as small as possible (minimisation).
In the demo, x is a position on the island (2 numbers, u and v in [−1, 1]) and **f(x) is the height of the ground**:
the island *is* the function. Lower ground = better answer. The flag marks the true minimum; the animals cannot see it.

Neither method uses gradients or looks at the whole map. Each animal only learns **f at its own position** each round,
which is why they work on bumpy, many-valleyed problems such as scheduling.

| Landscape | Formula | Why it is used |
| :--- | :--- | :--- |
| Ackley | −20·e^(−0.2√(½(x²+y²))) − e^(½(cos 2πx + cos 2πy)) + 20 + e | flat plateau with one deep funnel and many small dips |
| Sphere | x² + y² | one smooth bowl: easiest case |
| Rastrigin | 20 + x² − 10 cos 2πx + y² − 10 cos 2πy | egg-carton of local minima: a trap for greedy search |
| Himmelblau | (x² + y − 11)² + (x + y² − 7)² | four equally good valleys |

## 2. One round = Measure, Decide, Move

Both algorithms run in the same three steps, and the demo pauses on each one:

| Step | PSO (eagles) | GWO (wolves) |
| :--- | :--- | :--- |
| **1 · Measure** | f(x) for every eagle; update each **pbest** and the shared **gbest** | f(X) for every wolf; the three best become **α, β, δ** |
| **2 · Decide** | new velocity from momentum + own best + swarm best | one guess near each leader, then their average |
| **3 · Move** | x ← x + v | X ← new position |

## 3. Particle Swarm Optimization (Kennedy & Eberhart 1995; inertia weight: Shi & Eberhart 1998)

**Idea.** A flock looks for food. Each bird remembers the best place *it* has seen; the flock shares the best place *anyone* has seen. Every bird flies by mixing its own momentum with these two memories.

**Update rule** (per eagle *i*, per dimension *d*):

```
v ← w·v  +  c₁·r₁·(pbest − x)  +  c₂·r₂·(gbest − x)      then clip v to ±vmax
x ← x + v
```

| Symbol | Meaning | Value here | On screen |
| :--- | :--- | :--- | :--- |
| x | position = one candidate solution | — | the eagle |
| v | velocity: step for this round | — | white arrow |
| w | inertia weight (momentum) | 0.9 → 0.4, linear over 60 rounds | blue arrow, "w" on the card |
| c₁, c₂ | trust in own memory / in the swarm | 1.6, 1.6 | — |
| r₁, r₂ | random in [0, 1], drawn fresh each time | seeded RNG | — |
| pbest | best position this eagle ever found | — | green gem, green arrow |
| gbest | best position the whole swarm found | — | gold star + light pillar, gold arrow |
| vmax | speed limit | 0.32 (of the [−1, 1] range) | — |

**Why it works.** A large w early lets eagles overshoot good spots and explore. As w shrinks, the two pulls dominate and the swarm settles into the best region found.
**Strength:** fast, simple, few parameters. **Weakness:** everyone follows one gbest, so the swarm can collapse into a local valley too early.

## 4. Grey Wolf Optimizer (Mirjalili, Mirjalili & Lewis 2014)

**Idea.** A wolf pack hunts in a strict hierarchy: alpha leads, beta and delta help, the omegas follow. The pack searches, encircles the prey, and attacks.

**Update rule** (per wolf, per leader k ∈ {α, β, δ}, per dimension):

```
a  falls linearly from 2 to 0 over the run
A = 2a·r₁ − a          C = 2·r₂
D = | C·X_k − X |
X_k' = X_k − A·D       (one guess near each leader)
X ← (X_α' + X_β' + X_δ') / 3
```

| Symbol | Meaning | On screen |
| :--- | :--- | :--- |
| X | position = one candidate solution | the wolf |
| X_α, X_β, X_δ | the three best wolves this round | α β δ tags |
| a | exploration control, 2 → 0 | red circle, "a" on the card |
| A | random step size in [−a, a] | how far a guess can land |
| C | random weight in [0, 2] on the leader | — |
| D | distance from the wolf to a leader | coloured arrows to α, β, δ |
| X_k' | one guess near each leader | coloured dots |
| new X | the average of the three guesses | white ring + white arrow |

**Explore vs attack.** When |A| > 1 a guess can land *beyond* the leader, so the pack spreads out (only possible while a > 1, the first half of the run). When |A| < 1 every guess lands between the wolf and the leader: the pack encircles and attacks.
**Strength:** three leaders are harder to fool than one, and the shrinking a gives a smooth switch from exploring to exploiting. **Weakness:** no momentum or memory, so it can be slower across large flat areas.

## 5. Side by side

| | PSO · eagles | GWO · wolves |
| :--- | :--- | :--- |
| guided by | own best + swarm best | three leaders α β δ |
| memory | yes (pbest, momentum) | no, only this round's leaders |
| explore → exploit | w falls 0.9 → 0.4 | a falls 2 → 0 |
| typical behaviour | fast, can rush together | steady, encircles the best region |
| in cloud computing | task scheduling, load balancing | VM placement, energy-aware scheduling |

## 6. The cloud-computing connection (the Video)

Scheduling n jobs on m virtual machines has mⁿ possible assignments (20 jobs on 5 VMs: 5²⁰ ≈ 95 trillion), so exhaustive search is impossible.
A common encoding: an animal's position is a vector of numbers, one per job; rounding/scaling each number gives the VM for that job. The cost **f** is the **makespan** (the finishing time of the busiest VM), sometimes combined with energy or cost.
PSO and GWO then search that space exactly as on the island.

> The Video chapters "PSO / GWO in the cloud" illustrate this encoding with the followed animal's position. The island itself is still the benchmark landscape, not a real cloud workload.

## 7. Settings used in the demo

| Setting | Value |
| :--- | :--- |
| Animals per side | 12 |
| Rounds | 60 |
| Seed | 7 (same start positions for both, so the comparison is fair) |
| Search space | [−1, 1]² mapped onto the island top |
| Leaders in GWO | the three best of the current round (they move by the same rule) |

## 8. Checking the implementation

`node tools/test_algorithms.js` runs both algorithms headless on every landscape with five seeds and checks that the best-so-far never gets worse and that the median final error is under 2 % of the landscape's height range.
