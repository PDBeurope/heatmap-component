/** This file imports only the necessary submodules from D3, in order to keep the built bundle smaller.
 * Everything from D3 should be imported via this file. */

export * from 'd3-color';
export * from 'd3-scale';
export * from 'd3-scale-chromatic'; // This is just for list of color scales, TODO replace by hard-coded list
export * from 'd3-selection';
export * from 'd3-zoom';
