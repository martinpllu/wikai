import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const isWatch = process.argv.includes('--watch');

async function build() {
  const outdir = 'public/js';

  // Clean previous bundles (but keep source files for now during transition)
  const existingFiles = fs.readdirSync(outdir);
  for (const file of existingFiles) {
    if (file.startsWith('bundle.') && file.endsWith('.js')) {
      fs.unlinkSync(path.join(outdir, file));
    }
  }

  // Build the bundle
  const result = await esbuild.build({
    entryPoints: ['src/client/index.ts'],
    bundle: true,
    outdir,
    format: 'esm',
    target: 'es2020',
    minify: !isWatch,
    sourcemap: isWatch,
    metafile: true,
    external: ['https://cdn.jsdelivr.net/*'],
    define: {
      'process.env.NODE_ENV': isWatch ? '"development"' : '"production"'
    },
  });

  // Get the output file and compute hash
  const outputs = Object.keys(result.metafile!.outputs);
  const bundlePath = outputs.find(o => o.endsWith('.js') && !o.endsWith('.map'));

  if (!bundlePath) {
    throw new Error('No bundle output found');
  }

  const bundleContent = fs.readFileSync(bundlePath);
  const hash = crypto.createHash('md5').update(bundleContent).digest('hex').slice(0, 8);

  // Rename to include hash
  const hashedName = `bundle.${hash}.js`;
  const hashedPath = path.join(outdir, hashedName);
  fs.renameSync(bundlePath, hashedPath);

  // Also rename sourcemap if it exists
  if (fs.existsSync(bundlePath + '.map')) {
    fs.renameSync(bundlePath + '.map', hashedPath + '.map');
  }

  // Write manifest for server to read
  const manifest = { bundle: `/js/${hashedName}` };
  fs.writeFileSync('public/js/manifest.json', JSON.stringify(manifest, null, 2));

  console.log(`Built: ${hashedName}`);

  return hashedName;
}

if (isWatch) {
  // Watch mode
  const ctx = await esbuild.context({
    entryPoints: ['src/client/index.ts'],
    bundle: true,
    outdir: 'public/js',
    outbase: 'src/client',
    format: 'esm',
    target: 'es2020',
    sourcemap: true,
    external: ['https://cdn.jsdelivr.net/*'],
    plugins: [{
      name: 'rebuild-notify',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length === 0) {
            // Rename output to hashed version
            const outdir = 'public/js';
            const indexPath = path.join(outdir, 'index.js');
            if (fs.existsSync(indexPath)) {
              const content = fs.readFileSync(indexPath);
              const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
              const hashedName = `bundle.${hash}.js`;
              const hashedPath = path.join(outdir, hashedName);

              // Rename to hashed name first
              fs.renameSync(indexPath, hashedPath);
              if (fs.existsSync(indexPath + '.map')) {
                fs.renameSync(indexPath + '.map', hashedPath + '.map');
              }

              // Remove old bundles (excluding the one we just created)
              const files = fs.readdirSync(outdir);
              for (const file of files) {
                if (file.startsWith('bundle.') && file.endsWith('.js') && file !== hashedName) {
                  fs.unlinkSync(path.join(outdir, file));
                }
              }

              const manifest = { bundle: `/js/${hashedName}` };
              fs.writeFileSync('public/js/manifest.json', JSON.stringify(manifest, null, 2));

              console.log(`[${new Date().toLocaleTimeString()}] Rebuilt: ${hashedName}`);
            }
          }
        });
      }
    }]
  });

  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await build();
}
