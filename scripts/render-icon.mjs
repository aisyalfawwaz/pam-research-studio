import { _electron } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({
  args: ["scripts/icon-renderer.cjs"],
  env,
});
try {
  const page = await app.firstWindow();
  await page.locator("svg").waitFor();
  const file = path.resolve("apps/desktop/public/brand/app-icon.png");
  await page.screenshot({ path: file, omitBackground: true, scale: "css" });
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = await app.evaluate(
    ({ nativeImage }, { file, sizes }) => {
      const source = nativeImage.createFromPath(file);
      if (source.getSize().width !== 512)
        throw new Error("Icon source must be 512px");
      return sizes.map((size) =>
        source
          .resize({ width: size, height: size, quality: "best" })
          .toPNG()
          .toString("base64"),
      );
    },
    { file, sizes },
  );
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  const pngs = images.map((encoded, i) => {
    const png = Buffer.from(encoded, "base64"),
      at = 6 + i * 16;
    header[at] = header[at + 1] = sizes[i] === 256 ? 0 : sizes[i];
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
    return png;
  });
  await writeFile(
    "apps/desktop/public/brand/app-icon.ico",
    Buffer.concat([header, ...pngs]),
  );
  console.log(
    "Rendered original SVG to 512px PNG and seven-resolution Windows ICO.",
  );
} finally {
  await app.close();
}
