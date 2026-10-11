import { render } from 'preact';
import { App } from './ui/App';
import { UpdatePrompt } from './platform/UpdatePrompt';
import { registerServiceWorker } from './platform/sw-register';
import { requestPersistenceOnFirstUse } from './platform/persist';
import './ui/styles.css';

render(<App />, document.getElementById('app')!);

// Update banner lives in its own root so it works regardless of the UI worker's screens.
const updateRoot = document.createElement('div');
updateRoot.id = 'update-root';
document.body.appendChild(updateRoot);
render(<UpdatePrompt />, updateRoot);

registerServiceWorker();
requestPersistenceOnFirstUse();
