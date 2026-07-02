// Node.js 脚本：生成 PNG 图标
// 运行: node icons/generate.js
// 需要: npm install canvas (或使用 sharp/svg2img)

const fs = require('fs');
const path = require('path');

// 简单方案：使用内置方法创建 base64 PNG
// 如果无法安装 canvas，请手动用浏览器打开 generate_icons.html 生成图标

function createSimplePNG(size) {
  // 创建一个最小有效的 1x1 蓝色 PNG
  // 实际使用请通过 generate_icons.html 生成
  const base64_1x1_blue = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  console.log(`请在浏览器中打开 icons/generate_icons.html 来生成 ${size}x${size} 图标`);
}

[16, 48, 128].forEach(createSimplePNG);

console.log('\n推荐方式：用浏览器打开 icons/generate_icons.html，自动下载所有尺寸的图标');
