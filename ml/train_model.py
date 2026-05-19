"""
SALAMANDA WIDS — ML Model Training Script
Trains a Random Forest classifier on synthetic network traffic features
inspired by NSL-KDD / CICIDS2017 feature sets, then exports to ONNX.

Features (5):
  0: packet_rate       — packets per second from this device
  1: deauth_ratio      — fraction of packets that are deauth frames
  2: beacon_ratio      — fraction of packets that are beacon frames
  3: unique_channels   — number of distinct channels seen
  4: avg_signal        — average signal strength (dBm, normalised 0-1)

Labels:
  0 = normal
  1 = suspicious
  2 = malicious
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import os

np.random.seed(42)

# ── Synthetic dataset generation ──────────────────────────────────────────────
def generate_samples(n, label, packet_rate_range, deauth_range, beacon_range,
                     channel_range, signal_range):
    return np.column_stack([
        np.random.uniform(*packet_rate_range, n),   # packet_rate
        np.random.uniform(*deauth_range, n),         # deauth_ratio
        np.random.uniform(*beacon_range, n),         # beacon_ratio
        np.random.randint(*channel_range, n).astype(float),  # unique_channels
        np.random.uniform(*signal_range, n),         # avg_signal (normalised)
    ]), np.full(n, label)

# Normal traffic — low packet rate, minimal deauth, few channels
X_normal, y_normal = generate_samples(
    3000, 0,
    packet_rate_range=(0.5, 8.0),
    deauth_range=(0.0, 0.02),
    beacon_range=(0.0, 0.3),
    channel_range=(1, 3),
    signal_range=(0.3, 0.9),
)

# Suspicious — elevated packet rate, some deauth, multi-channel probing
X_suspicious, y_suspicious = generate_samples(
    1500, 1,
    packet_rate_range=(8.0, 25.0),
    deauth_range=(0.02, 0.15),
    beacon_range=(0.1, 0.6),
    channel_range=(2, 6),
    signal_range=(0.2, 0.8),
)

# Malicious — high packet rate, high deauth, many channels (port scan / DoS)
X_malicious, y_malicious = generate_samples(
    1500, 2,
    packet_rate_range=(20.0, 100.0),
    deauth_range=(0.15, 1.0),
    beacon_range=(0.0, 0.9),
    channel_range=(4, 14),
    signal_range=(0.1, 0.7),
)

X = np.vstack([X_normal, X_suspicious, X_malicious]).astype(np.float32)
y = np.concatenate([y_normal, y_suspicious, y_malicious])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# ── Train ─────────────────────────────────────────────────────────────────────
pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        min_samples_leaf=5,
        random_state=42,
        n_jobs=-1,
    )),
])

pipeline.fit(X_train, y_train)

# ── Evaluate ──────────────────────────────────────────────────────────────────
y_pred = pipeline.predict(X_test)
print("\n=== Classification Report ===")
print(classification_report(y_test, y_pred,
      target_names=["Normal", "Suspicious", "Malicious"]))
print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

# ── Export to ONNX ────────────────────────────────────────────────────────────
initial_type = [("float_input", FloatTensorType([None, 5]))]
onnx_model = convert_sklearn(pipeline, initial_types=initial_type,
                              target_opset=17)

out_dir = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "wids_rf.onnx")

with open(out_path, "wb") as f:
    f.write(onnx_model.SerializeToString())

model_size = os.path.getsize(out_path) / 1024
print(f"\n✓ ONNX model saved to {out_path} ({model_size:.1f} KB)")
print("Features: [packet_rate, deauth_ratio, beacon_ratio, unique_channels, avg_signal]")
print("Classes:  0=Normal  1=Suspicious  2=Malicious")
