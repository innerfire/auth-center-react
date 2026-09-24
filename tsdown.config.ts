import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.tsx",
    adapters: "src/adapters/index.ts",
    hooks: "src/hooks/index.ts",
    utils: "src/utils/index.ts",
    "gateway-profile": "src/gateway-profile.ts",
    types: "src/types.ts",
    spa: "src/spa/index.ts",
  },
  format: ["esm"],
  platform: "browser",
  target: "es2020",
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    /^react(?:\/.*)?$/,
    /^react-dom(?:\/.*)?$/,
    "styled-components",
    "antd",
    "@ant-design/icons",
    "@tanstack/react-query",
    "zustand",
    /^zustand\/.*$/,
  ],
});
