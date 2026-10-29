import base from './playwright.event-hub.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({...base,testMatch:['boss-access.spec.ts'],outputDir:'test-results/boss-access'});
