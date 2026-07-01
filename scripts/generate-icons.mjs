/**
 * Generate icon.ico and icon.png from the SVG logo.
 * Uses sharp for SVG→PNG conversion and png-to-ico for ICO generation.
 * Run: node scripts/generate-icons.mjs
 */
import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const SVG_PATH = path.join(PUBLIC, "icon.svg");

async function main() {
  // Install sharp temporarily
  console.log("Installing sharp...");
  execSync("npm install --no-save sharp png-to-ico", { cwd: ROOT, stdio: "inherit" });

  const sharp = (await import("sharp")).default;
  const pngToIco = (await import("png-to-ico")).default;

  const svgBuffer = readFileSync(SVG_PATH);

  // Generate 256x256 PNG
  const png256 = await sharp(svgBuffer).resize(256, 256).png().toBuffer();
  writeFileSync(path.join(PUBLIC, "icon.png"), png256);
  console.log("✓ icon.png (256x256)");

  // Generate multiple sizes for ICO
  const png16 = await sharp(svgBuffer).resize(16, 16).png().toBuffer();
  const png32 = await sharp(svgBuffer).resize(32, 32).png().toBuffer();
  const png48 = await sharp(svgBuffer).resize(48, 48).png().toBuffer();
  const png64 = await sharp(svgBuffer).resize(64, 64).png().toBuffer();
  const png128 = await sharp(svgBuffer).resize(128, 128).png().toBuffer();

  const icoBuffer = await pngToIco([png16, png32, png48, png64, png128, png256]);
  writeFileSync(path.join(PUBLIC, "icon.ico"), icoBuffer);
  console.log("✓ icon.ico (16,32,48,64,128,256)");

  console.log("\nDone! Icons saved to public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
