# Captain balance results (§1A.6)

Generated: 2026-09-26

Seed scheme: pairing p (row a, column b → p = a*4+b), game i uses
seed = p * 100000 + i, firstPlayer alternates by game index.
Baseline classic games use seed = 2000000 + i. 1000 games
per ordered pairing, 4000 baseline games. Medium AI on both seats.

## Overall win rate per captain (all seats)

| Captain | Overall | Moving first | Moving second |
|---|---|---|---|
| Captain Broadside | 52.2% | 55.5% | 48.9% |
| Captain Powderkeg | 54.6% | 56.4% | 52.8% |
| Captain Crow | 48.7% | 51.3% | 46.1% |
| Captain Ghost | 44.5% | 45.8% | 43.3% |

## Win-rate matrix (row captain vs column captain)

| | Captain Broadside | Captain Powderkeg | Captain Crow | Captain Ghost |
|---|---|---|---|---|
| Captain Broadside | 50.0%* | 48.4% | 52.9% | 56.4% |
| Captain Powderkeg | 52.0% | 50.0%* | 54.1% | 61.8% |
| Captain Crow | 47.5% | 43.0% | 50.0%* | 53.2% |
| Captain Ghost | 40.9% | 39.8% | 47.1% | 50.0%* |

*mirror pairings contribute a fixed 50%.

## Average game length (total shots, both sides)

| | Captain Broadside | Captain Powderkeg | Captain Crow | Captain Ghost |
|---|---|---|---|---|
| Captain Broadside | 88.6 | 89.1 | 87.7 | 90.1 |
| Captain Powderkeg | 90.3 | 89.9 | 88.1 | 90.0 |
| Captain Crow | 87.5 | 87.5 | 86.4 | 89.4 |
| Captain Ghost | 90.7 | 90.8 | 88.3 | 91.9 |

## Baseline: classic Medium vs Medium

| Games | First-player win rate | Avg length (shots) |
|---|---|---|
| 4000 | 51.9% | 88.1 |
