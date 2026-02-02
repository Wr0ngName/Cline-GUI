import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { spawn } from 'node:child_process';

const config: ForgeConfig = {
  hooks: {
    // Workaround for Electron Forge Vite bug #3738:
    // External modules are not included in the package. Reinstall them after pruning.
    // https://github.com/electron/forge/issues/3738#issuecomment-3199157664
    packageAfterPrune: async (_config, buildPath) => {
      // Dynamically import vite config to get external modules list
      const viteConfig = await import('./vite.main.config');
      const external = viteConfig?.default?.build?.rollupOptions?.external || [];

      if (external.length === 0) {
        console.log('No external modules to install');
        return;
      }

      // Filter out 'electron' as it's provided by the runtime
      const modulesToInstall = external.filter((m: string) => m !== 'electron');

      console.log('Installing external modules:', modulesToInstall);

      return new Promise<void>((resolve, reject) => {
        const npm = spawn('npm', ['install', '--no-package-lock', '--no-save', ...modulesToInstall], {
          cwd: buildPath,
          stdio: 'inherit',
          shell: true,
        });

        npm.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`npm install exited with code: ${code}`));
          }
        });

        npm.on('error', reject);
      });
    },
  },
  packagerConfig: {
    name: 'Cline GUI',
    executableName: 'cline-gui',
    asar: {
      unpack: '**/node_modules/{node-pty,@anthropic-ai,@img}/**/*',
    },
    icon: './resources/icons/icon',
    appBundleId: 'com.cline.gui',
    appCategoryType: 'public.app-category.developer-tools',
  },
  rebuildConfig: {
    // Rebuild native modules for the target platform
    onlyModules: ['node-pty'],
    force: true,
  },
  makers: [
    new MakerSquirrel({
      name: 'cline-gui',
      setupIcon: './resources/icons/icon.ico',
    }),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({
      options: {
        icon: './resources/icons/icon.png',
        categories: ['Development'],
        scripts: {
          postun: './resources/linux/postrm.rpm',
        },
      },
    }),
    new MakerDeb({
      options: {
        icon: './resources/icons/icon.png',
        categories: ['Development'],
        maintainer: 'wrongname',
        homepage: 'https://dev.web.wr0ng.name/wrongname/cline-gui',
        scripts: {
          postrm: './resources/linux/postrm',
        },
      },
    }),
  ],
  plugins: [
    // Auto-unpack native modules for runtime access
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
