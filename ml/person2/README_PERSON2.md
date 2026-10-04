# FairDrop Person 2 — Final ML Package

## Run
Open `notebooks/FAIRDROP_PERSON2_FINAL.ipynb` and **Run All**. No terminal commands are required.

## What is included
- Original `bot-detection_01` repository code, models, simulator and datasets under `repo/`.
- 67,352-session `simple_features.csv` under `external_data/`.
- One master Jupyter notebook that imports the original repo feature extraction, coordination engine and risk fusion code, while training the main large-data Model 1 and Model 2.
- Saved model/evaluation/RiskEvent artifacts under `artifacts/`.

## Person 2 scope
1. Telemetry/feature extraction reference
2. Behavioral bot classifier
3. Human-normal anomaly detection
4. Campaign/coordination intelligence
5. Adversarial simulation
6. RiskEvent output and evaluation

## Data truth
The 67k dataset is used for the main session classifier/anomaly detector. The repo event dataset is used for event/window feature extraction, coordination and simulator validation because it contains timestamps and event sequences.

## Accuracy
The notebook uses an untouched holdout and reports the actual measured metrics. It does not use IDs or labels as features and does not fabricate a >98% score. Model 2 and campaign intelligence are reported with appropriate detection/false-positive/coordination metrics rather than ordinary classification accuracy.
