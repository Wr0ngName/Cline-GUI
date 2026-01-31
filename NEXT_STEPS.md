# Next Steps - Getting Started with Cline GUI

## Immediate Actions to Begin Development

### 1. Initialize Electron Forge Project
```bash
cd /mnt/data/git/cline-gui
npm init electron-app@latest . -- --template=vite-typescript
```

This will scaffold the Electron + Vite + TypeScript project structure.

### 2. Install Core Dependencies
```bash
# Production dependencies
npm install @anthropic-ai/claude-code@^2.1.29 \
            @anthropic-ai/sdk@^0.72.1 \
            electron-store@^10.0.0 \
            electron-log@^5.4.3 \
            vue@^3.5.0 \
            pinia@^2.3.0

# Development dependencies
npm install -D @vitejs/plugin-vue@^5.2.0 \
               tailwindcss@^3.4.17 \
               autoprefixer@^10.4.20 \
               postcss@^8.4.49 \
               vue-tsc@^2.1.10
```

### 3. Configure Tailwind CSS
```bash
npx tailwindcss init -p
```

Edit `tailwind.config.js`:
```javascript
module.exports = {
  content: ['./src/renderer/**/*.{vue,ts,html}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

### 4. Update Directory Structure
Create the directory structure outlined in `plan.md`:
```bash
mkdir -p src/main/{ipc,services,utils}
mkdir -p src/renderer/{components/{chat,files,settings,history,shared},composables,stores,types,assets/styles}
mkdir -p src/preload
mkdir -p resources/{icons,installer}
```

### 5. Verify Setup
```bash
npm run start
```

If the Electron window opens, you're ready to begin implementation!

---

## Implementation Checklist (Phase 1)

Use this as your working checklist for Phase 1:

### Project Structure
- [ ] Initialize Electron Forge with Vite template
- [ ] Install all dependencies from plan.md
- [ ] Create directory structure
- [ ] Configure TypeScript (tsconfig.json files)
- [ ] Set up ESLint + Prettier
- [ ] Configure Tailwind CSS

### Main Process
- [ ] Create `src/main/index.ts` entry point
- [ ] Create `src/main/window.ts` window manager
- [ ] Set up electron-log in `src/main/utils/logger.ts`
- [ ] Create IPC handler structure in `src/main/ipc/`
- [ ] Implement preload script with contextBridge

### Renderer Process
- [ ] Create `src/renderer/main.ts` Vue entry
- [ ] Create `src/renderer/App.vue` root component
- [ ] Configure Pinia store
- [ ] Add Tailwind to `src/renderer/assets/styles/main.css`
- [ ] Set up type definitions for IPC in `src/renderer/types/`

### Basic UI Components
- [ ] Create `ChatWindow.vue` with basic layout
- [ ] Create `MessageList.vue` placeholder
- [ ] Create `InputBox.vue` with textarea
- [ ] Create shared `Button.vue` component
- [ ] Create shared `Spinner.vue` loading indicator

### Testing
- [ ] Test hot reload works for renderer
- [ ] Test main process restarts on file changes
- [ ] Test IPC communication (simple ping/pong)
- [ ] Verify DevTools opens and no console errors

---

## Key Files to Create First

1. **forge.config.ts** - Copy from plan.md, adjust paths if needed
2. **vite.renderer.config.ts** - Add Vue plugin and path aliases
3. **src/preload/index.ts** - Set up contextBridge for IPC
4. **src/main/index.ts** - Main process entry
5. **src/renderer/main.ts** - Vue app initialization
6. **src/renderer/App.vue** - Root component

---

## Recommended Development Flow

### Day 1: Setup
- Initialize project with Electron Forge
- Install all dependencies
- Configure build tools (TypeScript, Tailwind, ESLint)
- Create directory structure
- Get "Hello World" Electron app running

### Day 2: Architecture
- Implement preload script with IPC bridge
- Create basic main process structure
- Set up Vue app with routing (if needed)
- Create Pinia stores skeleton
- Test IPC communication works

### Day 3: Basic UI
- Build ChatWindow layout
- Create input box and message display
- Add styling with Tailwind
- Implement basic state management
- Test UI interactions

### Day 4+: Move to Phase 2
- Once Phase 1 checklist is complete, proceed to Claude integration
- Reference plan.md for detailed Phase 2 tasks

---

## Troubleshooting Common Issues

### Electron won't start
- Check Node.js version (need 20+)
- Verify all dependencies installed: `npm install`
- Check for TypeScript errors: `npm run typecheck`

### Hot reload not working
- Ensure Vite config is correct for renderer
- Check that files are in correct `src/` directories
- Restart dev server: `Ctrl+C` then `npm run start`

### IPC not working
- Verify preload script is loaded in window creation
- Check contextBridge syntax in preload/index.ts
- Use DevTools console to check for errors
- Ensure contextIsolation is enabled

### TypeScript errors
- Check tsconfig files match plan.md structure
- Ensure correct module resolution for main vs renderer
- Run `npm run typecheck` to see all errors

---

## Resources

### Documentation
- [Electron Docs](https://www.electronjs.org/docs/latest/)
- [Electron Forge Docs](https://www.electronforge.io/)
- [Vue 3 Docs](https://vuejs.org/guide/introduction.html)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Anthropic API Docs](https://docs.anthropic.com/)

### Example Projects
- [Electron Vite Template](https://github.com/electron/electron-vite-template)
- [Electron Vue Examples](https://github.com/vuejs/awesome-vue#electron)

---

## Success Metrics for Phase 1

You're ready to move to Phase 2 when:

1. Electron app launches without errors
2. Vue DevTools shows your app is running
3. Hot reload works for renderer changes
4. Main process restarts when main files change
5. IPC communication works (can send/receive messages)
6. Basic chat UI is visible and interactive
7. No TypeScript compilation errors
8. No ESLint warnings (or acceptable exceptions documented)

---

## Getting Help

If stuck, check:
1. Console errors in DevTools (Renderer process)
2. Terminal output (Main process logs)
3. TypeScript errors: `npm run typecheck`
4. Electron Forge documentation

---

**Ready to start?** Run the initialization commands above and begin with Phase 1 of plan.md!
