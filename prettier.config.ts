import { type Config } from 'prettier';

const config: Config = {
  trailingComma: 'none',
  semi: true,
  singleQuote: true,
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  // tailwindAttributes: ['className', '/data-.*/'],
  tailwindFunctions: ['cva', 'cn'],
  plugins: ['prettier-plugin-tailwindcss']
};

export default config;
