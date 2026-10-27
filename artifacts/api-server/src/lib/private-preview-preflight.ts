// Must execute before loading routes, sessions or any database clients.
import { validatePrivatePreview } from './private-preview.js';
validatePrivatePreview();
