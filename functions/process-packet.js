module.exports = async function (request) {
  const body = await request.json();
  const { packet, config } = body;

  if (!packet) {
    return new Response(JSON.stringify({ error: "No packet provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const alerts = [];

  // 1. Rogue AP detection
  if (packet.ssid && packet.type === "beacons" && config?.knownNetworks) {
    const knownNet = config.knownNetworks.find((n) => n.ssid === packet.ssid);
    if (knownNet && packet.bssid !== knownNet.bssid) {
      alerts.push({
        type: "ROGUE_AP",
        severity: "high",
        targetMac: packet.bssid,
        description: `Rogue AP detected: SSID "${packet.ssid}" from unauthorized BSSID ${packet.bssid}. Expected ${knownNet.bssid}.`,
        details: { expectedBssid: knownNet.bssid, actualBssid: packet.bssid, ssid: packet.ssid },
      });
    }
  }

  // 2. Unauthorized device
  if (config?.trustedMacs && !config.trustedMacs.includes(packet.sourceMac)) {
    alerts.push({
      type: "UNAUTHORIZED_DEVICE",
      severity: "low",
      targetMac: packet.sourceMac,
      description: `Unknown device: ${packet.sourceMac}${packet.ssid ? ` (SSID: ${packet.ssid})` : ""} on channel ${packet.channel}.`,
      details: { ssid: packet.ssid, channel: packet.channel, signal: packet.signalStrength },
    });
  }

  return new Response(JSON.stringify({ alerts, processed: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
