const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Alias para imports absolutos (@core, @presentation, etc.)
config.resolver.alias = {
  '@': path.resolve(__dirname, 'src'),
  '@core': path.resolve(__dirname, 'src/core'),
  '@application': path.resolve(__dirname, 'src/application'),
  '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
  '@presentation': path.resolve(__dirname, 'src/presentation'),
  '@shared': path.resolve(__dirname, 'src/shared'),
  '@di': path.resolve(__dirname, 'src/di'),
};

module.exports = config;
