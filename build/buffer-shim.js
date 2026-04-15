// buffer-shim.js — Must run before anything else in the bundle
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
