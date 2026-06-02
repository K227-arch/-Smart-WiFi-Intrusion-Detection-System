"""
SALAMANDA WIDS — ML Model v2 Training Script
Trained on NSL-KDD inspired features (41 features → 10 key features).
Exports two ONNX models:
  1. wids_rf_v2.onnx  — Random Forest (fast, high accuracy)
  2. wids_nb_v2.onnx  — Gaussian Naive Bayes (lightweight fallback)

NSL-KDD inspired features used (10):
  0:  duration          — connection duration (seconds)
  1:  protocol_type     — 0=tcp, 1=udp, 2=icmp
  2:  src_bytes         — bytes from src to dst
  3:  dst_bytes         — bytes from dst to src
  4:  land              — 1 if src/dst same host:port
  5:  wrong_fragment    — number of wrong fragments
  6:  urgent            — number of urgent packets
  7:  count             — connections to same host in 2s window
  8:  srv_count         — connections to same service in 2s window
  9:  serror_rate       — % SYN errors in count connections

Labels:
  0 = normal
  1 = DoS (SYN flood, ICMP flood, UDP flood)
  2 = Probe (port scan, ARP scan)
  3 = R2L (brute force, unauthorized access)
  4 = U2R (privilege escalation, anomaly)
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import os

np.random.seed(42)
N_FEATURES = 10

def gen(n, label, duration, proto, src_bytes, dst_bytes, land, wrong_frag,
        urgent, count, srv_count, serror_rate):
    def r(lo, hi): return np.random.uniform(lo, hi, n)
    def ri(lo, hi): return np.random.randint(lo, hi, n).astype(float)
    return np.column_stack([
        r(*duration), ri(*proto), r(*src_bytes), r(*dst_bytes),
        ri(*land), ri(*wrong_frag), ri(*urgent),
        ri(*count), ri(*srv_count), r(*serror_rate)
    ]), np.full(n, label)

# Normal traffic
X0, y0 = gen(3000, 0,
    duration=(0, 300), proto=(0, 3), src_bytes=(100, 50000),
    dst_bytes=(100, 50000), land=(0, 2), wrong_frag=(0, 1),
    urgent=(0, 1), count=(1, 20), srv_count=(1, 20), serror_rate=(0, 0.05))

# DoS attacks (SYN flood, ICMP flood)
X1, y1 = gen(1500, 1,
    duration=(0, 2), proto=(0, 3), src_bytes=(0, 100),
    dst_bytes=(0, 10), land=(0, 2), wrong_frag=(0, 3),
    urgent=(0, 2), count=(200, 512), srv_count=(200, 512), serror_rate=(0.8, 1.0))

# Probe (port scan, network scan)
X2, y2 = gen(1000, 2,
    duration=(0, 1), proto=(0, 3), src_bytes=(0, 500),
    dst_bytes=(0, 100), land=(0, 2), wrong_frag=(0, 2),
    urgent=(0, 1), count=(100, 512), srv_count=(1, 30), serror_rate=(0.1, 0.6))

# R2L (brute force, unauthorized)
X3, y3 = gen(800, 3,
    duration=(0, 60), proto=(0, 2), src_bytes=(1000, 100000),
    dst_bytes=(100, 5000), land=(0, 2), wrong_frag=(0, 1),
    urgent=(0, 3), count=(1, 50), srv_count=(1, 50), serror_rate=(0, 0.2))

# U2R (privilege escalation, anomaly)
X4, y4 = gen(700, 4,
    duration=(0, 120), proto=(0, 2), src_bytes=(500, 20000),
    dst_bytes=(500, 20000), land=(0, 2), wrong_frag=(0, 5),
    urgent=(0, 5), count=(1, 30), srv_count=(1, 30), serror_rate=(0, 0.3))

X = np.vstack([X0, X1, X2, X3, X4]).astype(np.float32)
y = np.concatenate([y0, y1, y2, y3, y4])

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y)

print(f"Training set: {len(X_train)} samples | Test set: {len(X_test)} samples")
print(f"Classes: {np.unique(y, return_counts=True)}")

# ── Model 1: Random Forest ────────────────────────────────────────────────────
rf_pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", RandomForestClassifier(
        n_estimators=150, max_depth=10, min_samples_leaf=3,
        random_state=42, n_jobs=-1, class_weight="balanced")),
])
rf_pipeline.fit(X_train, y_train)
y_pred_rf = rf_pipeline.predict(X_test)
print("\n=== Random Forest (NSL-KDD v2) ===")
print(classification_report(y_test, y_pred_rf,
    target_names=["Normal", "DoS", "Probe", "R2L", "U2R"]))
print(f"Macro F1: {f1_score(y_test, y_pred_rf, average='macro'):.4f}")

# ── Model 2: Naive Bayes ──────────────────────────────────────────────────────
nb_pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", GaussianNB()),
])
nb_pipeline.fit(X_train, y_train)
y_pred_nb = nb_pipeline.predict(X_test)
print("\n=== Gaussian Naive Bayes (NSL-KDD v2) ===")
print(classification_report(y_test, y_pred_nb,
    target_names=["Normal", "DoS", "Probe", "R2L", "U2R"]))

# ── Export to ONNX ────────────────────────────────────────────────────────────
out_dir = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(out_dir, exist_ok=True)

initial_type = [("float_input", FloatTensorType([None, N_FEATURES]))]

for name, pipeline in [("wids_rf_v2", rf_pipeline), ("wids_nb_v2", nb_pipeline)]:
    onnx_model = convert_sklearn(pipeline, initial_types=initial_type, target_opset=17)
    out_path = os.path.join(out_dir, f"{name}.onnx")
    with open(out_path, "wb") as f:
        f.write(onnx_model.SerializeToString())
    size_kb = os.path.getsize(out_path) / 1024
    print(f"\n✓ {name}.onnx saved ({size_kb:.1f} KB)")

print("\nFeatures: [duration, protocol_type, src_bytes, dst_bytes, land,")
print("           wrong_fragment, urgent, count, srv_count, serror_rate]")
print("Classes:  0=Normal  1=DoS  2=Probe  3=R2L  4=U2R")
 