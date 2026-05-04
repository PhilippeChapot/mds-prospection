/**
 * Génère les logos PNG retina pour les emails Resend.
 *
 * Pourquoi : Thunderbird (et certains clients exotiques) affichent les SVG
 * en taille naturelle, ignorant l'attribut HTML height="40". Les PNG sont
 * universellement supportes et respectes.
 *
 * Sortie : 160px de hauteur (retina x4 pour rendu 40px à 4x), ratio
 * preserve. Format PNG transparent.
 *
 * Usage : pnpm tsx scripts/generate-email-logos.ts
 *
 * Ré-exécutable : si on update les SVG sources, on relance le script et
 * on commit les nouveaux PNG.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs/promises';

const TARGETS: { source: string; output: string }[] = [
  {
    source: 'public/brand/MDS-LogoBlanc2026.svg',
    output: 'public/brand/MDS-LogoBlanc2026-email.png',
  },
  {
    source: 'public/brand/PRS-LogoBlanc2026.svg',
    output: 'public/brand/PRS-LogoBlanc2026-email.png',
  },
];

const TARGET_HEIGHT = 160; // 4x du rendu mail (40px) -> retina

async function main() {
  for (const { source, output } of TARGETS) {
    const sourcePath = path.resolve(process.cwd(), source);
    const outputPath = path.resolve(process.cwd(), output);

    const svgBuffer = await fs.readFile(sourcePath);

    // sharp resize avec hauteur fixe + width auto (ratio preserve via fit:'inside').
    // density: 300 suffit pour rendu retina ; limitInputPixels desactive
    // pour les SVG complexes qui rastérisent en >100M pixels intermediaires.
    const result = await sharp(svgBuffer, { density: 300, limitInputPixels: false })
      .resize({
        height: TARGET_HEIGHT,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();

    await fs.writeFile(outputPath, result);

    const meta = await sharp(result).metadata();
    console.log(
      `✓ ${path.basename(output).padEnd(36)} ${meta.width}×${meta.height}px (${(result.length / 1024).toFixed(1)} KB)`,
    );
  }
  console.log('\nDone. Commit the PNG files in public/brand/.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
