import sharp from 'sharp';

async function cropVariations() {
    const inputPath = 'C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\bb2f1847-751f-46d7-b871-38239014378b\\fixed_icon.png';
    const outputDir = 'C:\\Users\\Administrator\\.gemini\\antigravity-cli\\brain\\bb2f1847-751f-46d7-b871-38239014378b\\';
    
    const metadata = await sharp(inputPath).metadata();
    const w = metadata.width;
    const h = metadata.height;
    
    // Crop 10%
    await sharp(inputPath).extract({ left: Math.floor(w*0.1), top: Math.floor(h*0.1), width: Math.floor(w*0.8), height: Math.floor(h*0.8) }).resize(w, h).png().toFile(outputDir + 'crop_10.png');
    
    // Crop 15%
    await sharp(inputPath).extract({ left: Math.floor(w*0.15), top: Math.floor(h*0.15), width: Math.floor(w*0.7), height: Math.floor(h*0.7) }).resize(w, h).png().toFile(outputDir + 'crop_15.png');

    // Crop 20%
    await sharp(inputPath).extract({ left: Math.floor(w*0.2), top: Math.floor(h*0.2), width: Math.floor(w*0.6), height: Math.floor(h*0.6) }).resize(w, h).png().toFile(outputDir + 'crop_20.png');

    // Crop 25%
    await sharp(inputPath).extract({ left: Math.floor(w*0.25), top: Math.floor(h*0.25), width: Math.floor(w*0.5), height: Math.floor(h*0.5) }).resize(w, h).png().toFile(outputDir + 'crop_25.png');

    console.log('Done generating crops.');
}

cropVariations().catch(console.error);
