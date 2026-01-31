/**
 * Vue application entry point
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import './assets/styles/main.css';

// Create Vue app
const app = createApp(App);

// Install Pinia for state management
const pinia = createPinia();
app.use(pinia);

// Mount the app
app.mount('#app');

// Log startup
console.log('Cline GUI renderer started');
