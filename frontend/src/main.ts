import './i18n';
import { initRouter } from './router';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  initRouter(); // Start the router
}
