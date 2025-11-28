import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Plugin to create 404.html for GitHub Pages SPA routing
// This allows client-side routing to work on GitHub Pages
const create404Plugin = () => {
  return {
    name: 'create-404',
    closeBundle() {
      const distPath = join(__dirname, 'dist');
      const indexPath = join(distPath, 'index.html');
      const nojekyllPath = join(__dirname, '.nojekyll');
      
      try {
        const indexContent = readFileSync(indexPath, 'utf8');
        
        // Script to handle GitHub Pages 404 redirect
        // When GitHub Pages serves 404.html, the URL still shows the original path
        // (e.g., /Derayah-LTIP/login), so React Router can handle it directly
        // This script just handles the query string pattern if GitHub Pages uses it
        const redirectScript = `
<script type="text/javascript">
  // Single Page Apps for GitHub Pages
  // Handle query string redirect pattern (if GitHub Pages adds path as query param)
  (function(l) {
    if (l.search[1] === '/') {
      var decoded = l.search.slice(1).split('&').map(function(s) { 
        return s.replace(/~and~/g, '&');
      }).join('?');
      window.history.replaceState(null, null,
          l.pathname.slice(0, -1) + decoded + l.hash
      );
    }
  }(window.location));
</script>
`;
        
        // Insert the script in the <head> section so it runs before React loads
        const htmlWithRedirect = indexContent.replace('</head>', redirectScript + '</head>');
        
        // Write 404.html (identical to index.html with the redirect script)
        writeFileSync(join(distPath, '404.html'), htmlWithRedirect, 'utf8');
        
        // Ensure .nojekyll is in dist folder
        try {
          const nojekyllContent = readFileSync(nojekyllPath, 'utf8');
          writeFileSync(join(distPath, '.nojekyll'), nojekyllContent, 'utf8');
        } catch (e) {
          // .nojekyll might not exist, create an empty one
          writeFileSync(join(distPath, '.nojekyll'), '', 'utf8');
        }
        
        console.log('✅ Created 404.html and .nojekyll for GitHub Pages SPA routing');
      } catch (error) {
        console.warn('⚠️  Could not create 404.html:', error);
      }
    }
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Only use base path in production (for GitHub Pages)
  base: mode === 'production' ? '/Derayah-LTIP/' : '/',
  plugins: [react(), create404Plugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'react-vendor';
            }
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            if (id.includes('lucide-react')) {
              return 'ui-vendor';
            }
            if (id.includes('i18next') || id.includes('react-i18next')) {
              return 'i18n-vendor';
            }
            // Other vendor libraries
            return 'vendor';
          }
          
          // Split large pages into separate chunks
          if (id.includes('src/pages/Dashboard.tsx')) {
            return 'page-dashboard';
          }
          if (id.includes('src/pages/Employees.tsx')) {
            return 'page-employees';
          }
          if (id.includes('src/pages/Plans.tsx')) {
            return 'page-plans';
          }
          if (id.includes('src/pages/Grants.tsx')) {
            return 'page-grants';
          }
          if (id.includes('src/pages/VestingEvents.tsx')) {
            return 'page-vesting-events';
          }
          if (id.includes('src/pages/EmployeeDashboard.tsx')) {
            return 'page-employee-dashboard';
          }
          
          // Split employee portal pages
          if (id.includes('src/pages/Employee') && !id.includes('EmployeeDashboard')) {
            return 'employee-pages';
          }
          
          // Split operator pages
          if (id.includes('src/pages/Operator')) {
            return 'operator-pages';
          }
          
          // Split landing pages
          if (id.includes('src/pages/Landing')) {
            return 'landing-pages';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    // Enable minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console.log in production
        drop_debugger: true,
        pure_funcs: mode === 'production' ? ['console.log', 'console.info', 'console.debug'] : [],
      },
    },
    // Enable source maps only in development
    sourcemap: mode === 'development',
    // Optimize chunk loading
    target: 'esnext',
    cssCodeSplit: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['react', 'react-dom', 'react-router-dom'],
  },
}));
