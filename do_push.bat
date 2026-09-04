@echo off
cd /d "c:\Users\teoan\OneDrive\Documents\GitHub\-Smart-WiFi-Intrusion-Detection-System"

echo === staging files === > push_log.txt 2>&1
git add server.ts src/capture/packetCapture.ts src/capture/malwareDetector.ts >> push_log.txt 2>&1

echo === status === >> push_log.txt 2>&1
git status >> push_log.txt 2>&1

echo === committing === >> push_log.txt 2>&1
git commit -m "feat: malware detection engine + continuous capture fixes" >> push_log.txt 2>&1

echo === pushing === >> push_log.txt 2>&1
git push origin main >> push_log.txt 2>&1

echo === done, exit: %ERRORLEVEL% === >> push_log.txt 2>&1
