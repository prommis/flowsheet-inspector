import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync, rmSync } from 'fs'
import { join } from 'path'

// Helper function to recursively copy a directory
function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const file of readdirSync(src)) {
    const srcPath = join(src, file)
    const destPath = join(dest, file)
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      copyFileSync(srcPath, destPath)
    }
  }
}

// Clean the target directory (optional)
function cleanDir(dir: string) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-to-extension',
      closeBundle() {
        const src = './dist'
        const dest = '../extension/src/webview_template/webview_new'

        // Clean target directory to ensure no old files remain
        cleanDir(dest)

        // Copy build artifacts
        copyDir(src, dest)
        console.log('✅ Copied build to extension/src/webview_template/')
      }
    }
  ],
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      }
    }
  }
})
