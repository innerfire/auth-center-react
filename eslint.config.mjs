import appConfig from "../../apps/app/eslint.config.mjs";

const accountCenterConfig = [
  ...appConfig,
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "*.ts"],
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-img-element": "off",
    },
  },
];

export default accountCenterConfig;
