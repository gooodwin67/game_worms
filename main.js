import { App } from './src/app.js';

const app = new App();
app.init().catch((error) => {
  console.error(error);
  const loading = document.querySelector('#loading-screen h1');
  if (loading) loading.textContent = 'Initialization error';
});

