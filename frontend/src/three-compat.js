// Compat shim — re-exports all of three.js and backfills APIs removed in r152/r165.
// Imported via resolve.alias { /^three$/ } so both SplineBackground and SplineLoader
// get the missing named exports without touching three/examples/jsm/* subpaths.
export * from '../node_modules/three/build/three.module.js';
export { WebGLRenderTarget as WebGLMultipleRenderTargets } from '../node_modules/three/build/three.module.js';
export const LinearEncoding = 3000;
export const sRGBEncoding = 3001;

// Patch ShaderChunk in-place so SplineLoader's shader strings compile correctly.
// encodings_* were renamed to colorspace_* in r152; lightmap_fragment was removed.
import { ShaderChunk } from '../node_modules/three/build/three.module.js';
ShaderChunk.encodings_fragment      = ShaderChunk.colorspace_fragment      ?? '';
ShaderChunk.encodings_pars_fragment = ShaderChunk.colorspace_pars_fragment ?? '';
ShaderChunk.lightmap_fragment       = '';
