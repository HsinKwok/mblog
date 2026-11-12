/**
 * 首页卡片封面缩略图生成：public/images/random/*.jpg → public/images/random/s/*.webp
 * 卡片按 640×360 输出（与原图同一比例裁剪），首屏图片体积从数百 KB 降到数十 KB。
 * 原图保留，详情页正文中的图片不受影响。
 */
import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('public/images/random');
const OUT = path.join(SRC, 's');
const WIDTH = 640;
const HEIGHT = 360;
const QUALITY = 72;

await mkdir(OUT, { recursive: true });

const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png)$/i.test(f));
let before = 0;
let after = 0;

for (const file of files) {
  const from = path.join(SRC, file);
  const to = path.join(OUT, `${path.parse(file).name}.webp`);
  const info = await sharp(from)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
    .webp({ quality: QUALITY, effort: 4 })
    .toFile(to);
  before += (await stat(from)).size;
  after += info.size;
}

console.log(`封面缩略图：${files.length} 张，${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`);
