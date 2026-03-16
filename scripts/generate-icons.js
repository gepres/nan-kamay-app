const sharp = require('sharp');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
const LOGO = path.join(ASSETS, 'logo-kamay.png');
const BG_COLOR = '#0D1B12';
const ACCENT_COLOR = '#22C55E';

async function generateIcon() {
  // Main app icon: 1024x1024, dark bg, white mountain centered
  const logo = await sharp(LOGO)
    .negate({ alpha: false }) // Invert black→white (keeps transparency)
    .resize(680, 680, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: BG_COLOR }
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(path.join(ASSETS, 'icon.png'));

  console.log('✓ icon.png (1024x1024)');
}

async function generateAdaptiveForeground() {
  // Android adaptive icon foreground: 1024x1024 with safe zone padding
  // Safe zone is ~66% of the icon, so logo should be smaller
  const logo = await sharp(LOGO)
    .negate({ alpha: false })
    .resize(520, 520, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(path.join(ASSETS, 'android-icon-foreground.png'));

  console.log('✓ android-icon-foreground.png (1024x1024)');
}

async function generateSplash() {
  // Splash icon: larger for splash screen, white mountain on transparent
  const logo = await sharp(LOGO)
    .negate({ alpha: false })
    .resize(400, 400, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  await sharp({
    create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(path.join(ASSETS, 'splash-icon.png'));

  console.log('✓ splash-icon.png (512x512)');
}

(async () => {
  await generateIcon();
  await generateAdaptiveForeground();
  await generateSplash();
  console.log('\nAll icons generated!');
})();
