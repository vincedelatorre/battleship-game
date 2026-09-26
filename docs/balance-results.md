# Captain balance results (§1A.6)

Generated: 2026-09-26

Seed scheme: pairing p (row a, column b → p = a*4+b), game i uses
seed = p * 100000 + i, firstPlayer alternates by game index.
Baseline classic games use seed = 2000000 + i. 1000 games
per ordered pairing, 4000 baseline games. Medium AI on both seats.

## Overall win rate per captain (all seats)

| Captain | Overall | Moving first | Moving second |
|---|---|---|---|
| Captain Broadside | 51.4% | 54.7% | 48.1% |
| Captain Powderkeg | 53.4% | 55.6% | 51.2% |
| Captain Crow | 47.3% | 49.8% | 44.9% |
| Captain Ghost | 47.9% | 49.6% | 46.1% |

## Win-rate matrix (row captain vs column captain)

| | Captain Broadside | Captain Powderkeg | Captain Crow | Captain Ghost |
|---|---|---|---|---|
| Captain Broadside | 50.0%* | 48.4% | 52.9% | 54.1% |
| Captain Powderkeg | 52.0% | 50.0%* | 54.1% | 55.7% |
| Captain Crow | 47.5% | 43.0% | 50.0%* | 46.5% |
| Captain Ghost | 44.9% | 43.1% | 51.3% | 50.0%* |

*mirror pairings contribute a fixed 50%.

## Average game length (total shots, both sides)

| | Captain Broadside | Captain Powderkeg | Captain Crow | Captain Ghost |
|---|---|---|---|---|
| Captain Broadside | 88.6 | 89.1 | 87.7 | 91.5 |
| Captain Powderkeg | 90.3 | 89.9 | 88.1 | 92.1 |
| Captain Crow | 87.5 | 87.5 | 86.4 | 90.4 |
| Captain Ghost | 91.6 | 92.2 | 89.2 | 93.0 |

## Baseline: classic Medium vs Medium

| Games | First-player win rate | Avg length (shots) |
|---|---|---|
| 4000 | 51.9% | 88.1 |
