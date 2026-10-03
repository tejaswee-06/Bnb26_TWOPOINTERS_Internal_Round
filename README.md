# FairDrop — Behavioral XGBoost Classifier (v1.0.0)

First ML model for FairDrop (Person 2): supervised **session-level** behavioral classifier, `human` / `moderate_bot` / `advanced_bot`.
Everything below was produced by executing `fairdrop_behavioral_xgboost.ipynb` top-to-bottom on the attached Web Bot Detection Dataset.

## Layout
```
fairdrop_behavioral_xgboost.ipynb   # full pipeline with executed outputs
datasets/fairdrop_session_features.csv   # 1 row per labelled session (phase 1 + phase 2), id/label/split/phase + candidate features
models/xgboost_fairdrop_behavioral.json  # trained XGBoost (C_web_mouse, 61 features)
models/feature_columns.json              # {feature_set, columns} — input contract (NaN allowed)
models/model_metadata.json               # classes, features, hyper-parameters, dataset info, metrics, warnings
results/classification_report.csv, confusion_matrix.png, feature_importance.png, model_comparison.csv, shap_summary.png
```

## Data & protocol
- Unit: one session = one row. Phase 1 (150 sessions, official train 105 / test 45) is primary; phase 2 (140 sessions) is an external **web-only** check (its mouse export has no clicks and misaligned timestamps).
- Tuning: random search (24 configs) with session-level repeated stratified 5-fold CV on train only. Test touched only for reporting. Feature set for export chosen by train CV.
- User-agent features were computed, tested for leakage (UA-only CV macro-F1 = 0.556) and **removed**.

## Results (official test set, n=45; XGBoost)
| Feature Set | Accuracy | Macro F1 | Human Recall | Moderate Bot F1 | Advanced Bot F1 | Macro-F1 95% CI | CV Macro-F1 (train) |
|---|---|---|---|---|---|---|---|
| Mouse only | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | [1.00, 1.00] | 1.000 |
| Web + Mouse | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | [1.00, 1.00] | 1.000 |
| Web only | 0.911 | 0.911 | 0.933 | 0.933 | 0.897 | [0.81, 0.98] | 0.904 |
| Web only, no POST beacon (ablation) | 0.933 | 0.933 | 1.000 | 0.966 | 0.897 | [0.84, 1.00] | 0.951 |

Exported model (C_web_mouse): accuracy 1.000, macro-F1 1.000 (95% CI 1.00–1.00), humans flagged as bot 0.0%, advanced→human 0.0%.
External phase 2 (web only, no refit): accuracy 0.321, macro-F1 0.238, advanced→human 100.0%.

## Read this before trusting the numbers
- **Mouse separability is a dataset signature.** Single mouse features (e.g. median speed: moderate bots ≈0.06 px/ms, advanced bots capped at 0.50 px/ms, humans in between) separate the classes almost perfectly, so test metrics of 1.00 reflect how these bots were generated. Exact 95% interval for test accuracy on 45 sessions: 0.92–1.00.
- **Web behaviour did not transfer across environments.** Web-only learns well inside each phase (phase-2 grouped CV macro-F1 0.93) but phase1→phase2 gives macro-F1 0.24 and phase2→phase1 0.52. Expect the same gap on FairDrop until it is retrained/validated on FairDrop traffic.
- User-agent strings (all humans Chrome, all bots Opera in phase 1) were excluded as dataset leakage.

## Inference
```python
out = predict_session(features_dict, session_id)   # notebook §22
# {"session_id", "classification", "probabilities": {...}, "risk_score": 1 - P(human), "model_version"}
```
`risk_score` is an **uncalibrated** model score. The model provides intelligence only — it never allocates seats, mutates inventory or makes queue decisions.

## Warning
Trained on a Wikipedia-replica browsing dataset, not ticket-drop traffic. It **requires FairDrop-specific validation** with the team simulator and unseen adversarial traffic before any policy use. Test set is small (15 sessions/class): see confidence intervals.
