/**
 * Generate a PDF document explaining AI Training from start to finish.
 * Uses the `pdfkit` library.
 * Run: node scripts/generate-ai-training-pdf.mjs
 */
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// Install pdfkit
console.log("Installing pdfkit...");
execSync("npm install --no-save pdfkit", { cwd: ROOT, stdio: "inherit" });

const PDFDocument = (await import("pdfkit")).default;
const fs = await import("fs");

const OUTPUT = path.join(ROOT, "public", "AI_Training_Guide_SALAMANDA.pdf");

const doc = new PDFDocument({
  size: "A4",
  margins: { top: 60, bottom: 60, left: 55, right: 55 },
  info: {
    Title: "AI Training in Intrusion Detection Systems — A Complete Guide",
    Author: "SALAMANDA WIDS Team",
    Subject: "Machine Learning for Network Security",
  },
});

const stream = fs.createWriteStream(OUTPUT);
doc.pipe(stream);

// ── Helper Functions ──────────────────────────────────────────────────────────
const AMBER = "#D97706";
const DARK = "#0F172A";
const GRAY = "#64748B";

function heading(text, size = 20) {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(size).fillColor(DARK).text(text);
  doc.moveDown(0.3);
  doc.moveTo(doc.x, doc.y).lineTo(doc.x + 480, doc.y).strokeColor(AMBER).lineWidth(2).stroke();
  doc.moveDown(0.5);
}

function subheading(text) {
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(DARK).text(text);
  doc.moveDown(0.2);
}

function body(text) {
  doc.font("Helvetica").fontSize(10.5).fillColor("#1E293B").text(text, { lineGap: 3 });
  doc.moveDown(0.3);
}

function bullet(text) {
  doc.font("Helvetica").fontSize(10.5).fillColor("#1E293B").text(`  •  ${text}`, { lineGap: 2 });
}

function code(text) {
  doc.moveDown(0.2);
  const x = doc.x;
  const y = doc.y;
  doc.rect(x, y, 480, 14 * text.split("\n").length + 16).fill("#F1F5F9");
  doc.font("Courier").fontSize(9).fillColor("#334155").text(text, x + 10, y + 8, { lineGap: 3 });
  doc.moveDown(0.4);
}

function note(text) {
  doc.moveDown(0.2);
  const x = doc.x;
  const y = doc.y;
  doc.rect(x, y, 480, 40).fill("#FFFBEB");
  doc.rect(x, y, 4, 40).fill(AMBER);
  doc.font("Helvetica-Oblique").fontSize(9.5).fillColor("#92400E").text(text, x + 14, y + 12, { width: 456 });
  doc.moveDown(0.6);
  doc.x = x;
}

// ── Cover Page ────────────────────────────────────────────────────────────────
doc.moveDown(6);
doc.font("Helvetica-Bold").fontSize(28).fillColor(DARK)
  .text("AI Model Training", { align: "center" });
doc.font("Helvetica-Bold").fontSize(28).fillColor(AMBER)
  .text("for Intrusion Detection Systems", { align: "center" });
doc.moveDown(1);
doc.font("Helvetica").fontSize(14).fillColor(GRAY)
  .text("A Complete Guide from Data Collection to Deployment", { align: "center" });
doc.moveDown(0.5);
doc.font("Helvetica").fontSize(12).fillColor(GRAY)
  .text("With a Practical Example from SALAMANDA WIDS", { align: "center" });
doc.moveDown(4);
doc.font("Helvetica").fontSize(10).fillColor(GRAY)
  .text("SALAMANDA Network Intrusion Detection System", { align: "center" });
doc.text("© 2026 SALAMANDA Team", { align: "center" });
doc.text("Version 2.0", { align: "center" });

// ── Page 2: Table of Contents ─────────────────────────────────────────────────
doc.addPage();
heading("Table of Contents", 18);
const toc = [
  "1. Introduction to AI in Intrusion Detection",
  "2. The Machine Learning Pipeline",
  "3. Step 1 — Problem Definition",
  "4. Step 2 — Data Collection & Preparation",
  "5. Step 3 — Feature Engineering",
  "6. Step 4 — Model Selection",
  "7. Step 5 — Training the Model",
  "8. Step 6 — Evaluation & Metrics",
  "9. Step 7 — Export & Deployment",
  "10. Step 8 — Runtime Inference",
  "11. Complete Example: SALAMANDA WIDS",
  "12. Code Walkthrough",
  "13. Improving the Model",
  "14. Summary & Key Takeaways",
];
toc.forEach((item) => {
  doc.font("Helvetica").fontSize(11).fillColor("#1E293B").text(item);
  doc.moveDown(0.15);
});

// ── Page 3: Introduction ──────────────────────────────────────────────────────
doc.addPage();
heading("1. Introduction to AI in Intrusion Detection");
body("An Intrusion Detection System (IDS) monitors network traffic for suspicious activity. Traditional IDS tools use static rules (signatures) to match known attacks. While effective against known threats, they fail against novel or zero-day attacks.");
doc.moveDown(0.2);
body("Machine Learning (ML) adds a layer of intelligence. Instead of hardcoded rules, an ML model learns patterns from data — it can identify anomalies that no human has written a rule for.");
doc.moveDown(0.2);
subheading("Why ML for Network Security?");
bullet("Detects unknown/novel attack patterns (zero-day detection)");
bullet("Adapts to changing network behavior over time");
bullet("Reduces false positives through confidence scoring");
bullet("Classifies attack types (DoS, Probe, Brute Force, etc.)");
bullet("Works alongside traditional signature-based detection");

doc.moveDown(0.4);
subheading("Types of ML in IDS");
body("Supervised Learning: Train on labeled data (normal vs. attack). This is what SALAMANDA uses.");
body("Unsupervised Learning: Detect anomalies without labels (clustering, autoencoders).");
body("Reinforcement Learning: Adapt detection policies based on feedback loops.");

// ── Page 4: The Pipeline ──────────────────────────────────────────────────────
doc.addPage();
heading("2. The Machine Learning Pipeline");
body("Training an AI model follows a structured pipeline. Each step builds on the previous one:");

doc.moveDown(0.3);
const steps = [
  ["Problem Definition", "What are we detecting? What classes/labels do we need?"],
  ["Data Collection", "Gather labeled network traffic (normal + attacks)"],
  ["Feature Engineering", "Extract numerical features from raw packets"],
  ["Model Selection", "Choose an algorithm (Random Forest, Neural Network, etc.)"],
  ["Training", "Feed data into the model, let it learn patterns"],
  ["Evaluation", "Test on unseen data, measure accuracy/precision/recall"],
  ["Export", "Convert to a deployment format (ONNX, TensorFlow Lite)"],
  ["Deployment", "Run inference on live traffic in real-time"],
];

steps.forEach(([title, desc], i) => {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(AMBER).text(`Step ${i + 1}: ${title}`, { continued: false });
  doc.font("Helvetica").fontSize(10).fillColor("#475569").text(`    ${desc}`);
  doc.moveDown(0.2);
});

doc.moveDown(0.3);
note("Key Insight: The model is only as good as its training data. Garbage in = garbage out. Data quality matters more than algorithm choice.");

// ── Page 5: Problem Definition ────────────────────────────────────────────────
doc.addPage();
heading("3. Step 1 — Problem Definition");
body("Before writing any code, define clearly what the model should detect:");
doc.moveDown(0.2);
subheading("For SALAMANDA WIDS:");
bullet("Input: Network traffic features (packet rates, protocols, byte counts)");
bullet("Output: Classification into Normal, DoS, Probe, R2L, or U2R");
bullet("Goal: ≥95% accuracy with <5% false positive rate");
bullet("Constraint: Must run in <10ms per prediction (real-time requirement)");
doc.moveDown(0.3);
subheading("Attack Categories (NSL-KDD Standard):");
body("• Normal (Class 0): Legitimate network traffic");
body("• DoS (Class 1): Denial of Service — SYN floods, ICMP floods, UDP floods");
body("• Probe (Class 2): Network scanning — port scans, ARP scans, ping sweeps");
body("• R2L (Class 3): Remote to Local — brute force login, unauthorized access");
body("• U2R (Class 4): User to Root — privilege escalation, buffer overflow");

// ── Page 6: Data Collection ───────────────────────────────────────────────────
doc.addPage();
heading("4. Step 2 — Data Collection & Preparation");
body("You need labeled examples of both normal and attack traffic. Sources:");
doc.moveDown(0.2);
subheading("Public Datasets:");
bullet("NSL-KDD — Improved version of KDD Cup 99 (41 features, 5 classes)");
bullet("CICIDS2017 — Modern attacks (DDoS, brute force, web attacks)");
bullet("UNSW-NB15 — 49 features, 9 attack types");
bullet("CSE-CIC-IDS2018 — Updated with newer attack vectors");
doc.moveDown(0.2);
subheading("Synthetic Generation (SALAMANDA Approach):");
body("When real attack data is unavailable or insufficient, generate synthetic samples based on known statistical distributions of attack patterns:");
code(`# Generate DoS attack samples
X_dos, y_dos = generate_samples(
    n=1500, label=1,       # 1500 samples, class 1 (DoS)
    duration=(0, 2),        # Very short connections
    src_bytes=(0, 100),     # Minimal payload
    count=(200, 512),       # Many connections in 2s
    serror_rate=(0.8, 1.0)  # 80-100% SYN errors
)`);

subheading("Data Splitting:");
body("Always split data before training to get honest evaluation:");
bullet("Training Set (80%): Model learns from this");
bullet("Test Set (20%): Evaluate final performance — NEVER train on this");

// ── Page 7: Feature Engineering ───────────────────────────────────────────────
doc.addPage();
heading("5. Step 3 — Feature Engineering");
body("Raw packets are bytes. ML models need numbers. Feature engineering transforms packets into meaningful numerical vectors.");
doc.moveDown(0.2);
subheading("SALAMANDA Model v1 — WiFi Features (5 features):");
body("Extracted from 802.11 wireless frames:");
bullet("packet_rate: Packets per second from a device");
bullet("deauth_ratio: Fraction of deauth frames (high = DoS)");
bullet("beacon_ratio: Fraction of beacon frames (high = AP spoofing)");
bullet("unique_channels: How many channels a device probes (high = scanning)");
bullet("avg_signal: Normalized signal strength");

doc.moveDown(0.3);
subheading("SALAMANDA Model v2 — Network Features (10 features):");
body("Extracted from TCP/IP layer (inspired by NSL-KDD):");
bullet("duration: How long the connection lasted");
bullet("protocol_type: TCP (0), UDP (1), or ICMP (2)");
bullet("src_bytes: Bytes sent from source");
bullet("dst_bytes: Bytes received from destination");
bullet("land: Same src/dst host and port (1=yes)");
bullet("wrong_fragment: Corrupted fragments (anomaly indicator)");
bullet("urgent: Urgent flag count");
bullet("count: Connections to same host in 2-second window");
bullet("srv_count: Connections to same service in 2-second window");
bullet("serror_rate: Percentage of SYN errors (high = SYN flood)");

doc.moveDown(0.3);
subheading("Feature Normalization:");
body("StandardScaler transforms features to mean=0, std=1. This ensures packet_rate (range 0-100) doesn't dominate serror_rate (range 0-1):");
code(`from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_normalized = scaler.fit_transform(X_train)`);

// ── Page 8: Model Selection ───────────────────────────────────────────────────
doc.addPage();
heading("6. Step 4 — Model Selection");
body("Different algorithms have different strengths. For IDS, we prioritize speed and interpretability:");
doc.moveDown(0.3);

subheading("Random Forest (SALAMANDA's Primary Model)");
bullet("Ensemble of 100-150 decision trees that vote on classification");
bullet("Handles non-linear boundaries well");
bullet("Fast inference (<1ms per prediction)");
bullet("Resistant to overfitting with enough trees");
bullet("Provides feature importance ranking");

doc.moveDown(0.3);
subheading("Gaussian Naive Bayes (SALAMANDA's Fallback)");
bullet("Assumes features are independent (naive assumption)");
bullet("Extremely fast — good for resource-constrained environments");
bullet("Less accurate but reliable baseline");

doc.moveDown(0.3);
subheading("Other Options (Not used in SALAMANDA):");
bullet("Neural Networks: Higher accuracy on large datasets, slower inference");
bullet("SVM: Good for binary classification, struggles with >3 classes");
bullet("XGBoost/LightGBM: Gradient boosting — often wins competitions");
bullet("Autoencoders: Unsupervised anomaly detection");

doc.moveDown(0.3);
note("SALAMANDA uses Random Forest because it offers the best tradeoff between accuracy (>97%), speed (<1ms), and explainability for a real-time IDS.");

// ── Page 9: Training ──────────────────────────────────────────────────────────
doc.addPage();
heading("7. Step 5 — Training the Model");
body("Training is where the model learns patterns from data. For a Random Forest:");
doc.moveDown(0.2);
subheading("What Happens During Training:");
body("1. The algorithm creates N decision trees (e.g., 150)");
body("2. Each tree sees a random subset of the training data (bagging)");
body("3. Each tree split considers a random subset of features");
body("4. Trees learn to separate classes by finding optimal split thresholds");
body("5. Final prediction = majority vote across all trees");

doc.moveDown(0.3);
subheading("Training Code:");
code(`from sklearn.ensemble import RandomForestClassifier
from sklearn.pipeline import Pipeline

pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", RandomForestClassifier(
        n_estimators=150,    # 150 trees
        max_depth=10,        # Max tree depth
        min_samples_leaf=3,  # Min samples per leaf
        class_weight="balanced",  # Handle imbalanced classes
        random_state=42,
        n_jobs=-1  # Use all CPU cores
    ))
])

pipeline.fit(X_train, y_train)  # This is the training step`);

doc.moveDown(0.2);
subheading("Hyperparameters Explained:");
bullet("n_estimators: More trees = better accuracy but slower (150 is a sweet spot)");
bullet("max_depth: Deeper trees = more complex patterns but risk overfitting");
bullet("min_samples_leaf: Prevents trees from memorizing individual examples");
bullet("class_weight='balanced': Adjusts for imbalanced classes (fewer attack samples)");

// ── Page 10: Evaluation ───────────────────────────────────────────────────────
doc.addPage();
heading("8. Step 6 — Evaluation & Metrics");
body("After training, evaluate on the TEST set (data the model has never seen):");
doc.moveDown(0.2);
subheading("Key Metrics:");
bullet("Accuracy: % of correct predictions overall");
bullet("Precision: Of all 'attack' predictions, how many were actually attacks?");
bullet("Recall: Of all real attacks, how many did we catch?");
bullet("F1-Score: Harmonic mean of precision and recall");
bullet("False Positive Rate: Normal traffic incorrectly flagged as attacks");

doc.moveDown(0.3);
subheading("Example Results (SALAMANDA v2 Random Forest):");
code(`=== Classification Report ===
              precision  recall  f1-score  support
Normal           0.98     0.99     0.98      600
DoS              0.99     0.99     0.99      300
Probe            0.97     0.96     0.97      200
R2L              0.95     0.94     0.95      160
U2R              0.93     0.91     0.92      140

Macro F1: 0.9620
Accuracy: 0.9743`);

doc.moveDown(0.2);
subheading("Confusion Matrix:");
body("Shows what the model predicted vs. reality. Diagonal = correct predictions:");
code(`Predicted →  Normal  DoS  Probe  R2L  U2R
Normal          594    2     3     1    0
DoS               1  297     1     1    0
Probe             3    1   192     3    1
R2L               2    0     4   150    4
U2R               4    0     2     6  128`);

note("For IDS, Recall (catching real attacks) is more important than Precision. A missed attack is worse than a false alarm.");

// ── Page 11: Export ───────────────────────────────────────────────────────────
doc.addPage();
heading("9. Step 7 — Export & Deployment");
body("Models trained in Python need to run in production (Node.js, C++, mobile). ONNX is the universal format:");
doc.moveDown(0.2);
subheading("What is ONNX?");
body("Open Neural Network Exchange — an open format that lets you train in Python (scikit-learn, PyTorch) and run inference anywhere (JavaScript, C#, Java, mobile).");

doc.moveDown(0.3);
subheading("Export Code:");
code(`from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Define input shape: batch_size x num_features
initial_type = [("float_input", FloatTensorType([None, 10]))]

# Convert trained pipeline to ONNX
onnx_model = convert_sklearn(
    pipeline,
    initial_types=initial_type,
    target_opset=17
)

# Save to file
with open("models/wids_rf_v2.onnx", "wb") as f:
    f.write(onnx_model.SerializeToString())`);

doc.moveDown(0.3);
subheading("Why ONNX?");
bullet("Language-agnostic: Run in JavaScript, Python, C++, Java, C#");
bullet("Hardware-optimized: Leverages CPU SIMD, GPU, NPU acceleration");
bullet("Small file size: SALAMANDA's model is ~200KB");
bullet("Fast inference: Sub-millisecond predictions");

// ── Page 12: Runtime Inference ────────────────────────────────────────────────
doc.addPage();
heading("10. Step 8 — Runtime Inference");
body("In production, SALAMANDA runs the ONNX model on every network packet:");
doc.moveDown(0.2);
subheading("Inference Pipeline:");
body("Packet Arrives → Extract Features → Normalize → ONNX Model → Class + Confidence → Alert");

doc.moveDown(0.3);
subheading("JavaScript Inference (Node.js with onnxruntime-node):");
code(`import * as ort from "onnxruntime-node";

// Load model once at startup
const session = await ort.InferenceSession.create("models/wids_rf_v2.onnx");

// For each packet:
async function classify(features) {
  const input = new Float32Array(features);  // 10 features
  const tensor = new ort.Tensor("float32", input, [1, 10]);
  const feeds = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  
  const classIndex = Number(results[session.outputNames[0]].data[0]);
  const probs = results[session.outputNames[1]].data;
  const confidence = probs[classIndex];
  
  return { classIndex, confidence };
  // classIndex: 0=Normal, 1=DoS, 2=Probe, 3=R2L, 4=U2R
}`);

doc.moveDown(0.2);
subheading("Confidence Thresholding:");
body("SALAMANDA only triggers alerts when confidence ≥ 92%. This dramatically reduces false positives:");
code(`const { classIndex, confidence } = await classify(features);
if (classIndex > 0 && confidence >= 0.92) {
  generateAlert(classIndex, confidence);
}`);

// ── Page 13: Complete Example ─────────────────────────────────────────────────
doc.addPage();
heading("11. Complete Example: SALAMANDA WIDS");
body("Here's the full training process end-to-end as implemented in SALAMANDA:");
doc.moveDown(0.3);

subheading("Step 1: Generate Training Data");
code(`import numpy as np

# Normal traffic: low rate, minimal errors
X_normal = generate(3000, duration=(0,300), count=(1,20), 
                    serror_rate=(0, 0.05))

# DoS attack: short bursts, many connections, high SYN errors
X_dos = generate(1500, duration=(0,2), count=(200,512),
                 serror_rate=(0.8, 1.0))

# Combine all classes
X = np.vstack([X_normal, X_dos, X_probe, X_r2l, X_u2r])
y = np.concatenate([y_normal, y_dos, y_probe, y_r2l, y_u2r])`);

subheading("Step 2: Split & Train");
code(`from sklearn.model_selection import train_test_split

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y)

pipeline.fit(X_train, y_train)`);

subheading("Step 3: Evaluate");
code(`y_pred = pipeline.predict(X_test)
print(classification_report(y_test, y_pred))
# Accuracy: 97.4%, Macro F1: 0.962`);

subheading("Step 4: Export & Deploy");
code(`onnx_model = convert_sklearn(pipeline, initial_types=initial_type)
# Save → models/wids_rf_v2.onnx (200KB)
# Load in Node.js → classify live traffic in <1ms`);

// ── Page 14: Improving ────────────────────────────────────────────────────────
doc.addPage();
heading("13. Improving the Model");
subheading("Use Real Data:");
body("Replace synthetic data with captured traffic from SALAMANDA's packet capture. Label normal vs. attack periods to create a dataset specific to your environment.");

doc.moveDown(0.2);
subheading("Add More Features:");
bullet("Payload entropy (encrypted vs. plaintext)");
bullet("Time-of-day patterns");
bullet("DNS query frequency and domain length");
bullet("TLS certificate anomalies");

doc.moveDown(0.2);
subheading("Ensemble Methods:");
body("Combine multiple models — if both Random Forest AND Naive Bayes agree it's an attack, confidence is higher. SALAMANDA already does this with its 3-model architecture.");

doc.moveDown(0.2);
subheading("Online Learning:");
body("Update the model periodically with new labeled data from dismissed alerts (false positives become negative training examples).");

doc.moveDown(0.2);
subheading("Deep Learning:");
body("For larger deployments, consider LSTM or Transformer models that can learn temporal patterns across packet sequences rather than individual packets.");

// ── Page 15: Summary ──────────────────────────────────────────────────────────
doc.addPage();
heading("14. Summary & Key Takeaways");
doc.moveDown(0.3);

const takeaways = [
  "AI training for IDS follows: Data → Features → Train → Evaluate → Deploy",
  "Random Forest is ideal for IDS: fast, accurate, interpretable",
  "Feature engineering matters more than algorithm choice",
  "Always evaluate on unseen test data — never train and test on the same data",
  "ONNX format allows training in Python, deployment anywhere",
  "Confidence thresholding (≥92%) dramatically reduces false positives",
  "Synthetic data is a valid starting point; real data improves accuracy",
  "Multiple models (ensemble) increase reliability",
  "The model must run in real-time (<10ms) for a production IDS",
  "Continuous improvement: feed real-world results back into training",
];

takeaways.forEach((t, i) => {
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(AMBER).text(`${i + 1}.`, { continued: true });
  doc.font("Helvetica").fontSize(10.5).fillColor("#1E293B").text(`  ${t}`);
  doc.moveDown(0.25);
});

doc.moveDown(1);
doc.font("Helvetica-Bold").fontSize(12).fillColor(DARK)
  .text("To retrain SALAMANDA's models:", { underline: false });
doc.moveDown(0.3);
code(`cd ml/
pip install numpy scikit-learn skl2onnx
python train_nslkdd.py`);

doc.moveDown(1);
doc.font("Helvetica").fontSize(9).fillColor(GRAY)
  .text("Generated by SALAMANDA WIDS v2.0 — © 2026 SALAMANDA Team", { align: "center" });

// ── Finalize ──────────────────────────────────────────────────────────────────
doc.end();

stream.on("finish", () => {
  const size = fs.statSync(OUTPUT).size / 1024;
  console.log(`\n✓ PDF generated: ${OUTPUT} (${size.toFixed(0)} KB)`);
  console.log("  Accessible at: http://localhost:3001/AI_Training_Guide_SALAMANDA.pdf");
});
