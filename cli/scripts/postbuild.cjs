// Adds #!/usr/bin/env node shebang to dist/index.js after tsc build
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, '..', 'dist', 'index.js');
if (fs.existsSync(target)) {
  const content = fs.readFileSync(target, 'utf8');
  if (!content.startsWith('#!/usr/bin/env node')) {
    fs.writeFileSync(target, '#!/usr/bin/env node\n' + content);
  }
  // chmod +x on Unix
  try { fs.chmodSync(target, 0o755); } catch (_) {}
  console.log('postbuild: shebang added to dist/index.js');
}
