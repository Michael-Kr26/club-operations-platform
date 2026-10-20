import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// Allow asynchronous query/render turns on a busy local machine. Assertions
// still wait for the actual UI state; no fixed sleeps are introduced.
configure({ asyncUtilTimeout: 5000 });
